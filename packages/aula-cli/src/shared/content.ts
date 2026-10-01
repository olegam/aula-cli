import { createHash } from "node:crypto";
import { readLocalInput } from "./attachments";
import { getFlagValue } from "./args";
import { writePrivateJson } from "./private-files";

export const integerFlag = (args: string[], name: string, fallback: number, min = 0, max = 10000): number => {
  const raw = getFlagValue(args, name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid --${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid --${name}`);
  return value;
};
export const collectionRows = (response: unknown, key: string): Record<string, unknown>[] => {
  if (!response || typeof response !== "object") throw new Error("Unsupported collection response");
  const envelope = response as Record<string, unknown>;
  const status = envelope.status as { code?: unknown } | undefined;
  if (status && status.code !== 0 && status.code !== 200) throw new Error("Aula API reported an error");
  const data = envelope.data ?? response;
  const rows = Array.isArray(data) ? data : (data as Record<string, unknown>)?.[key];
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error(`Unsupported ${key} collection shape; verify the API before paginating`);
  }
  return rows;
};
const identity = (row: Record<string, unknown>): string => {
  if (typeof row.id !== "number" && typeof row.id !== "string") throw new Error("Collection row has no stable id");
  return String(row.id);
};
export const collectAllPages = async (fetchPage: (cursor: number) => Promise<unknown>, key: string, start: number, step: number, maxPages: number) => {
  const rows = new Map<string, Record<string, unknown>>();
  const pages = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const response = await fetchPage(start + page * step);
    const batch = collectionRows(response, key);
    const data = (response as { data?: Record<string, unknown> }).data;
    const more = data && !Array.isArray(data) && (key === "posts" || key === "threads") ? data[key === "posts" ? "hasMorePosts" : "moreMessagesExist"] : undefined;
    if (!batch.length && more === true) throw new Error("Pagination returned an empty page while reporting more results");
    if (!batch.length) return { data: [...rows.values()], pagination: { complete: true, pagesFetched: page + 1, start } };
    const ids = batch.map(identity);
    const signature = JSON.stringify(ids);
    if (pages.has(signature) || ids.every(id => rows.has(id))) throw new Error("Pagination repeated existing rows; refusing to claim completeness");
    pages.add(signature);
    for (const row of batch) if (!rows.has(identity(row))) rows.set(identity(row), row);
    if (more === false && (key === "posts" || key === "threads")) return { data: [...rows.values()], pagination: { complete: true, pagesFetched: page + 1, start } };
  }
  throw new Error("Pagination limit reached before an empty page; increase --max-pages");
};
export const canonicalContent = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalContent);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, canonicalContent(v)]));
  if (typeof value === "string" && value.startsWith("https://media-prod.aula.dk/")) {
    try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { /* Keep malformed data unchanged. */ }
  }
  return value;
};
export const contentDigest = (row: Record<string, unknown>): string => {
  // Deliberately excludes read receipts and counters; includes content and attachment metadata.
  const content = Object.fromEntries(["title", "subject", "text", "content", "attachments", "latestMessage", "updatedAt", "modifiedAt", "lastModified", "editedAt", "sendDateTime", "messageType"].filter(key => key in row).map(key => [key, row[key]]));
  if (!Object.keys(content).length) throw new Error("No supported revision content fields");
  return createHash("sha256").update(JSON.stringify(canonicalContent(content))).digest("hex");
};
export const validateSnapshotArgs = (args: string[]): void => {
  if (!getFlagValue(args, "snapshot")) return;
  const account = getFlagValue(args, "snapshot-account");
  if (!account || !/^[a-zA-Z0-9_-]{1,80}$/.test(account)) throw new Error("Snapshots require --snapshot-account=<unique-stable-label-per-login>; never reuse across accounts");
};
export const trackRevisions = async (result: unknown, key: string, args: string[], scope: string): Promise<unknown> => {
  const path = getFlagValue(args, "snapshot");
  if (!path) return result;
  validateSnapshotArgs(args);
  const account = getFlagValue(args, "snapshot-account");
  scope = JSON.stringify([account, scope]);
  const rows = collectionRows(result, key);
  let previous: Record<string, string> = {};
  try {
    const raw = (await readLocalInput(path, 10_000_000)).toString("utf8");
    if (raw.length > 10_000_000) throw new Error("Snapshot too large");
    const stored = JSON.parse(raw);
    if (stored.version !== 1 || stored.scope !== scope || !stored.digests || typeof stored.digests !== "object" || Array.isArray(stored.digests)) throw new Error("Snapshot scope or format mismatch");
    previous = stored.digests;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const digests = { ...previous };
  const changes: { id: string; change: string }[] = [];
  for (const row of rows) {
    const id = identity(row), digest = contentDigest(row);
    if ((!Object.hasOwn(previous, id) || previous[id] !== digest)) changes.push({ id, change: Object.hasOwn(previous, id) ? "changed" : "new" });
    Object.defineProperty(digests, id, { value: digest, enumerable: true, configurable: true, writable: true });
  }
  await writePrivateJson(path, { version: 1, scope, digests });
  return { ...(result as object), revisions: { changes, note: "Changes compare visible content/attachment metadata. Missing items are not treated as deleted; same-URL byte replacements require re-download and SHA-256 comparison." } };
};

export const singlePost = (response: unknown, expectedId: number): Record<string, unknown> => {
  if (!response || typeof response !== "object") throw new Error("Unsupported post response");
  const envelope = response as { status?: { code?: unknown }; data?: unknown };
  if (envelope.status && envelope.status.code !== 0 && envelope.status.code !== 200) throw new Error("Aula API reported an error");
  const data = envelope.data;
  if (!data || typeof data !== "object" || Array.isArray(data) || !("id" in data)) throw new Error("Unsupported single-post shape");
  if ((typeof data.id !== "number" && typeof data.id !== "string") || String(data.id) !== String(expectedId)) throw new Error("Single-post identity does not match requested parent");
  return data as Record<string, unknown>;
};

export const findMessage = async (fetchPage: (page: number) => Promise<unknown>, messageId: string, maxPages: number): Promise<Record<string, unknown>> => {
  const visited = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const rows = collectionRows(await fetchPage(page), "messages");
    if (!rows.length) break;
    const matches = rows.filter(row => String(row.id) === messageId);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) throw new Error("Ambiguous message identity");
    const signature = JSON.stringify(rows.map(identity));
    if (visited.has(signature)) throw new Error("Message pagination repeated a page");
    visited.add(signature);
  }
  throw new Error("Message not found within the scanned pages");
};
