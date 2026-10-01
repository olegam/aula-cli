import { collectAllPages, integerFlag, trackRevisions, validateSnapshotArgs, singlePost } from "../shared/content";
import { getFlagValue, parseCsvNumbers } from "../shared/args";
import { printOutput } from "../shared/output";
import { getBootstrapDefaults } from "../shared/bootstrap-defaults";
import { createClientFromArgs } from "../shared/session";

export const runPostsCommand = async (args: string[]): Promise<void> => {
  validateSnapshotArgs(args);
  if (args[0] === "get") {
    const id = integerFlag(args, "post-id", 0, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new Error("Missing --post-id");
    const client = await createClientFromArgs(args);
    const post = singlePost(await client.v23.getPost(id), id);
    const result = await trackRevisions({ data: [post] }, "posts", args, `post:${id}`);
    printOutput(result, args, { importantFields: ["id", "title", "content.html", "attachments"] });
    return;
  }
  const explicitProfileIds = parseCsvNumbers(getFlagValue(args, "profiles"));
  const defaults = await getBootstrapDefaults();
  const institutionProfileIds = explicitProfileIds.length ? explicitProfileIds : defaults.profileIds;
  if (!institutionProfileIds.length) {
    throw new Error("No profile IDs found. Run `aula-cli login` first or pass --profiles=5008819,5008813");
  }

  const client = await createClientFromArgs(args);
  const index = integerFlag(args, "index", 0);
  const limit = integerFlag(args, "limit", 10, 1, 100);
  const fetchPage = (cursor: number) => client.v23.getPosts({ institutionProfileIds, index: cursor, limit });
  const fetched = args.includes("--all")
    ? await collectAllPages(fetchPage, "posts", index, limit, integerFlag(args, "max-pages", 100, 1, 1000))
    : await fetchPage(index);
  const result = await trackRevisions(fetched, "posts", args, `posts:${[...institutionProfileIds].sort((a,b) => a-b).join(",")}`);

  printOutput(result, args, {
    importantFields: [
      "id",
      "title",
      "timestamp",
      "content.html",
      "ownerProfile.fullName",
      "isImportant",
      "expireAt",
      "relatedProfiles"
    ]
  });
};
