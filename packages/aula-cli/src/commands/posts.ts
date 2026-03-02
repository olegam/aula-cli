import { getFlagValue, getNumberFlag, parseCsvNumbers } from "../shared/args";
import { createClientFromArgs } from "../shared/session";

export const runPostsCommand = async (args: string[]): Promise<void> => {
  const institutionProfileIds = parseCsvNumbers(getFlagValue(args, "profiles"));
  if (!institutionProfileIds.length) {
    throw new Error("Missing required flag: --profiles=5008819,5008813");
  }

  const client = await createClientFromArgs(args);
  const result = await client.v23.getPosts({
    institutionProfileIds,
    index: getNumberFlag(args, "index", 0),
    limit: getNumberFlag(args, "limit", 10)
  });

  console.log(JSON.stringify(result, null, 2));
};
