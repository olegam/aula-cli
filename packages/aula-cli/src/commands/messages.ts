import { collectAllPages, integerFlag, trackRevisions, validateSnapshotArgs } from "../shared/content";
import { printOutput } from "../shared/output";
import { createClientFromArgs } from "../shared/session";

export const runMessagesCommand = async (args: string[]): Promise<void> => {
  validateSnapshotArgs(args);
  const subcommand = args[0];
  const client = await createClientFromArgs(args);

  if (subcommand === "threads") {
    const page = integerFlag(args, "page", 0);
    const fetchPage = (cursor: number) => client.v23.getThreads({ page: cursor });
    const fetched = args.includes("--all") ? await collectAllPages(fetchPage, "threads", page, 1, integerFlag(args, "max-pages", 100, 1, 1000)) : await fetchPage(page);
    const result = await trackRevisions(fetched, "threads", args, "threads");
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
    const threadId = integerFlag(args, "thread-id", 0, 1, Number.MAX_SAFE_INTEGER);
    if (!threadId) {
      throw new Error("Missing or invalid --thread-id=<number>");
    }

    const page = integerFlag(args, "page", 0);
    const fetchPage = (cursor: number) => client.v23.getMessagesForThread({ threadId, page: cursor });
    const fetched = args.includes("--all") ? await collectAllPages(fetchPage, "messages", page, 1, integerFlag(args, "max-pages", 100, 1, 1000)) : await fetchPage(page);
    const result = await trackRevisions(fetched, "messages", args, `thread:${threadId}`);
    printOutput(result, args, {
      importantFields: ["id", "sendDateTime", "senderName", "text", "creator.fullName", "attachments", "isForwarded"]
    });
    return;
  }

  throw new Error("Usage: messages threads [--page=0] OR messages thread --thread-id=123 [--page=0]");
};
