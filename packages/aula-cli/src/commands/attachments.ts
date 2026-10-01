import { createClientFromArgs } from "../shared/session";
import { findMessage, integerFlag, singlePost } from "../shared/content";
import { getFlagValue } from "../shared/args";
import { attachmentMetadata, downloadAttachment, extractAttachment, readLocalInput, selectAttachment } from "../shared/attachments";

export const runAttachmentsCommand = async (args: string[]): Promise<void> => {
  const command = args[0];
  const input = getFlagValue(args, "input");
  if (command === "list" && input) {
    console.log(JSON.stringify(attachmentMetadata(JSON.parse((await readLocalInput(input)).toString("utf8"))), null, 2));
    return;
  }
  const urlFile = getFlagValue(args, "url-file"), output = getFlagValue(args, "out");
  const postIdRaw = getFlagValue(args, "post-id"), threadIdRaw = getFlagValue(args, "thread-id");
  const attachmentId = getFlagValue(args, "attachment-id");
  if (command === "download" && output && (postIdRaw || threadIdRaw)) {
    if (urlFile || (postIdRaw && threadIdRaw) || !attachmentId) throw new Error("Choose one parent and supply --attachment-id");
    const client = await createClientFromArgs(args);
    let parent: unknown;
    if (postIdRaw) {
      const postId = integerFlag(args, "post-id", 0, 1, Number.MAX_SAFE_INTEGER);
      parent = singlePost(await client.v23.getPost(postId), postId);
    }
    else {
      const threadId = integerFlag(args, "thread-id", 0, 1, Number.MAX_SAFE_INTEGER);
      const messageId = getFlagValue(args, "message-id");
      if (!messageId || ! /^[A-Za-z0-9._:-]{1,200}$/.test(messageId)) throw new Error("Thread downloads require --message-id");
      parent = await findMessage(page => client.v23.getMessagesForThread({ threadId, page }), messageId, integerFlag(args, "max-pages", 100, 1, 1000));
    }
    const attachment = selectAttachment(parent, attachmentId);
    console.log(JSON.stringify({ attachmentId, ...await downloadAttachment(attachment.url, output) }, null, 2));
    return;
  }
  if (command === "download" && urlFile && output) {
    const url = (await readLocalInput(urlFile, 16384)).toString("utf8").trim();
    console.log(JSON.stringify(await downloadAttachment(url, output), null, 2));
    return;
  }
  if (command === "extract" && input) {
    const result = await extractAttachment(input);
    console.log(JSON.stringify({ ...result, warning: result.noExtractableText ? "No extractable text found. Image-based content requires visual/OCR review; do not treat this document as read." : "Text extraction may omit scanned pages, images, embedded objects, or revision markup. Visual/OCR review may be needed for a complete reading." }, null, 2));
    return;
  }
  throw new Error("Usage: attachments list --input=posts.json | download --url-file=private-url.txt --out=private-directory | extract --input=downloaded-file");
};
