import { getFlagValue, getNumberFlag } from "../shared/args";
import { printOutput } from "../shared/output";
import { createClientFromArgs } from "../shared/session";

export const runMessagesCommand = async (args: string[]): Promise<void> => {
  const subcommand = args[0];
  const client = await createClientFromArgs(args);

  if (subcommand === "threads") {
    const result = await client.v23.getThreads({
      page: getNumberFlag(args, "page", 0)
    });
    printOutput(result, args, {
      importantFields: [
        "id",
        "subject",
        "creator.fullName",
        "latestMessage.sendDateTime",
        "latestMessage.text",
        "read",
        "regardingChildren"
      ]
    });
    return;
  }

  if (subcommand === "thread") {
    const threadIdRaw = getFlagValue(args, "thread-id");
    const threadId = threadIdRaw ? Number.parseInt(threadIdRaw, 10) : Number.NaN;
    if (!Number.isFinite(threadId)) {
      throw new Error("Missing or invalid --thread-id=<number>");
    }

    const result = await client.v23.getMessagesForThread({
      threadId,
      page: getNumberFlag(args, "page", 0)
    });
    printOutput(result, args, {
      importantFields: ["id", "sendDateTime", "senderName", "text", "creator.fullName", "attachments", "isForwarded"]
    });
    return;
  }

  throw new Error("Usage: messages threads [--page=0] OR messages thread --thread-id=123 [--page=0]");
};
