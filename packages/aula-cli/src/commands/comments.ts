import { getFlagValue } from "../shared/args";
import { collectAllPages, integerFlag, trackRevisions, validateSnapshotArgs, singlePost } from "../shared/content";
import { printOutput } from "../shared/output";
import { createClientFromArgs } from "../shared/session";

export const runCommentsCommand = async (args: string[]): Promise<void> => {
  validateSnapshotArgs(args);
  const parentId = integerFlag(args, "parent-id", 0, 1, Number.MAX_SAFE_INTEGER);
  const parentType = getFlagValue(args, "parent-type") ?? "Post";
  if (!parentId || !["Post", "Media", "Comment"].includes(parentType)) throw new Error("Use --parent-id and --parent-type=Post|Media|Comment");
  const startIndex = integerFlag(args, "index", 0);
  const limit = integerFlag(args, "limit", 5, 1, 100);
  const client = await createClientFromArgs(args);
  if (parentType === "Post") {
    const post = singlePost(await client.v23.getPost(parentId), parentId);
    if (post.allowComments === false && post.commentCount === 0) {
      printOutput({ data: [], availability: { commentsEnabled: false, commentCount: 0, readAttempted: false } }, args);
      return;
    }
  }
  const fetchPage = (index: number) => client.v23.getComments({ parentId, parentType: parentType as "Post" | "Media" | "Comment", startIndex: index, limit });
  const fetched = args.includes("--all") ? await collectAllPages(fetchPage, "comments", startIndex, limit, integerFlag(args, "max-pages", 100, 1, 1000)) : await fetchPage(startIndex);
  const result = await trackRevisions(fetched, "comments", args, `comments:${parentType}:${parentId}`);
  printOutput(result, args, { importantFields: ["id", "content", "creator.fullName", "createdAt", "updatedAt", "commentCount", "comments"] });
};
