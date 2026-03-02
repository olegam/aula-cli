import { getFlagValue, getNumberFlag, parseCsvNumbers } from "../shared/args";
import { printOutput } from "../shared/output";
import { getBootstrapDefaults } from "../shared/bootstrap-defaults";
import { createClientFromArgs } from "../shared/session";

export const runPostsCommand = async (args: string[]): Promise<void> => {
  const explicitProfileIds = parseCsvNumbers(getFlagValue(args, "profiles"));
  const defaults = await getBootstrapDefaults();
  const institutionProfileIds = explicitProfileIds.length ? explicitProfileIds : defaults.profileIds;
  if (!institutionProfileIds.length) {
    throw new Error("No profile IDs found. Run `aula-cli login` first or pass --profiles=5008819,5008813");
  }

  const client = await createClientFromArgs(args);
  const result = await client.v23.getPosts({
    institutionProfileIds,
    index: getNumberFlag(args, "index", 0),
    limit: getNumberFlag(args, "limit", 10)
  });

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
