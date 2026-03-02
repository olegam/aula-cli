import { getFlagValue, parseCsvNumbers, parseCsvStrings } from "../shared/args";
import { createClientFromArgs } from "../shared/session";

export const runNotificationsCommand = async (args: string[]): Promise<void> => {
  const activeChildrenIds = parseCsvNumbers(getFlagValue(args, "children"));
  const activeInstitutionCodes = parseCsvStrings(getFlagValue(args, "institutions"));

  if (!activeChildrenIds.length || !activeInstitutionCodes.length) {
    throw new Error("Missing required flags: --children=1,2 and --institutions=CODE1,CODE2");
  }

  const client = await createClientFromArgs(args);
  const result = await client.v23.getNotificationsForActiveProfile({
    activeChildrenIds,
    activeInstitutionCodes
  });

  console.log(JSON.stringify(result, null, 2));
};
