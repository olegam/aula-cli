import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink, type FileHandle } from "node:fs/promises";
import { resolve, join, parse } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const validateMediaUrl = (value: string): URL => {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid attachment URL"); }
  if (url.protocol !== "https:" || url.hostname !== "media-prod.aula.dk" || url.port || url.username || url.password || url.hash || url.pathname === "/") throw new Error("Only observed HTTPS media-prod.aula.dk attachment URLs are supported");
  return url;
};
export const readLocalInput = async (path: string, limit = MAX_ATTACHMENT_BYTES): Promise<Buffer> => {
  const handle = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error("Input must be a regular, size-limited file");
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let size = 0;
    while (size < buffer.length) { const read = await handle.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    if (size > stat.size || size > limit) throw new Error("Input changed or exceeded size limit");
    return buffer.subarray(0, size);
  } finally { await handle.close(); }
};
const privateDirectory = async (path: string): Promise<string> => {
  const directory = resolve(path);
  // Reject symlinks in every existing ancestor, rather than trusting only the final component.
  let current = parse(directory).root;
  for (const component of directory.slice(current.length).split("/")) {
    current = join(current, component);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Symlink output directory rejected"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0 || await realpath(directory) !== directory) throw new Error("Output directory must be private (0700) and not symlinked");
  return directory;
};
export const downloadAttachment = async (value: string, outputDirectory: string, fetcher: typeof fetch = fetch) => {
  const url = validateMediaUrl(value);
  const directory = await privateDirectory(outputDirectory);
  let response: Response;
  try { response = await fetcher(url, { method: "GET", redirect: "error", credentials: "omit", headers: { Accept: "application/pdf, image/*, text/plain, application/octet-stream" }, signal: AbortSignal.timeout(60_000) }); }
  catch { throw new Error("Attachment request failed; signed URL suppressed"); }
  if (!response.ok || !response.body) throw new Error(`Attachment download failed (${response.status})`);
  const lengthHeader = response.headers.get("content-length");
  const advertised = lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : undefined;
  if (advertised !== undefined && advertised > MAX_ATTACHMENT_BYTES) { await response.body.cancel(); throw new Error("Attachment too large"); }
  // Never use response filenames or remote path components for local paths.
  const path = join(directory, `attachment-${randomUUID()}.bin`);
  let file: FileHandle | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let ownsFile = false;
  const hash = createHash("sha256");
  let size = 0;
  try {
    reader = response.body.getReader();
    file = await open(path, "wx", 0o600);
    ownsFile = true;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_ATTACHMENT_BYTES) throw new Error("Attachment too large");
      hash.update(chunk);
      await file.writeFile(chunk);
    }
    // Fetch may decode compressed bodies, whose Content-Length describes the
    // encoded representation. Compare lengths only for unencoded responses.
    const encoding = response.headers.get("content-encoding");
    if (advertised !== undefined && (!encoding || encoding === "identity") && size !== advertised) throw new Error("Attachment length mismatch");
    await file.sync();
    await file.close();
    return { path, bytes: size, sha256: hash.digest("hex"), contentType: response.headers.get("content-type")?.split(";")[0] ?? "unknown" };
  } catch {
    try { await reader?.cancel(); } catch { /* Cleanup must not hide the download failure. */ }
    try { await file?.close(); } catch { /* Continue removing our incomplete output. */ }
    if (!ownsFile) throw new Error("Attachment download could not start; no output file created");
    try { await unlink(path); }
    catch { throw new Error("Attachment download failed; partial file cleanup could not be confirmed"); }
    throw new Error("Attachment download interrupted or exceeded size limit; partial file removed");
  } finally {
    // Some runtime-backed response streams can reject lock release after EOF.
    // The download outcome is already established by read/sync/close; cleanup
    // must not replace successful metadata or the sanitized primary failure.
    try { reader?.releaseLock(); } catch { /* Best-effort local stream cleanup. */ }
  }
};
export const extractAttachment = async (path: string): Promise<{ text: string; noExtractableText: boolean }> => {
  const bytes = await readLocalInput(path);
  const isPdf = bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"));
  const isZip = bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (!isPdf && !isZip) throw new Error("Only local PDF or DOCX text extraction is supported");
  // Feed the validated bytes via stdin so no filename/symlink race reaches the parser.
  const text = await new Promise<string>((resolveText, reject) => {
    const child = execFile(isPdf ? "pdftotext" : "python3", isPdf ? ["-layout", "-", "-"] : [fileURLToPath(new URL("./extract-docx.py", import.meta.url))], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(new Error("Document extraction failed; PDF requires Poppler pdftotext and DOCX requires Python 3"));
      else resolveText(stdout);
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(bytes);
  });
  return { text, noExtractableText: !text.trim() };
};
export const attachmentMetadata = (value: unknown): { source: string; metadata: unknown }[] => {
  const results: { source: string; metadata: unknown }[] = [];
  const walk = (node: unknown, path: string, depth: number) => {
    if (depth > 40) throw new Error("Attachment input nesting is too deep");
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (key === "attachments" && Array.isArray(child)) for (const item of child) results.push({ source: `${path}.attachments`, metadata: item });
      else walk(child, `${path}.${key}`, depth + 1);
    }
  };
  walk(value, "$", 0);
  return results;
};

export const resolveAttachment = (value: unknown): { id: string; url: string } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid attachment metadata");
  const attachment = value as Record<string, any>;
  if (attachment.link || attachment.document) throw new Error("Links and protected documents are not ordinary file attachments");
  if (attachment.status !== "available") throw new Error("Attachment is not available");
  const file = attachment.file ?? attachment.media?.file;
  if (!file || typeof file !== "object") throw new Error("No supported file attachment");
  for (const candidate of [attachment, attachment.media, file]) {
    if (candidate && candidate.scanningStatus != null && !["available", "bypassed"].includes(candidate.scanningStatus)) throw new Error("Attachment scan status blocks download or is unknown");
  }
  const id = attachment.id ?? attachment.file?.id ?? attachment.media?.id;
  if ((typeof id !== "string" && typeof id !== "number") || !String(id)) throw new Error("Attachment has no stable metadata id");
  if (typeof file.url !== "string") throw new Error("Attachment has no URL; refresh its parent content");
  validateMediaUrl(file.url);
  return { id: String(id), url: file.url };
};
export const selectAttachment = (parent: unknown, id: string): { id: string; url: string } => {
  const matches = attachmentMetadata(parent).flatMap(({ metadata }) => {
    try { const resolved = resolveAttachment(metadata); return resolved.id === id ? [resolved] : []; }
    catch { return []; }
  });
  if (matches.length !== 1) throw new Error("Expected one available attachment with no reported scan block with this ID in the refreshed parent");
  return matches[0]!;
};
