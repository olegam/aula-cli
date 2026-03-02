import { getFlagValue, parseCsvNumbers, parseCsvStrings } from "../shared/args";
import { createClientFromArgs } from "../shared/session";

export const runPresenceCommand = async (args: string[]): Promise<void> => {
  const subcommand = args[0];
  const client = await createClientFromArgs(args);

  if (subcommand === "daily-overview") {
    const childIds = parseCsvNumbers(getFlagValue(args, "children"));
    if (!childIds.length) {
      throw new Error("Missing required flag: --children=5008813,5011592");
    }

    const result = await client.v23.getPresenceDailyOverview({ childIds });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "states") {
    const institutionProfileIds = parseCsvNumbers(getFlagValue(args, "profiles"));
    if (!institutionProfileIds.length) {
      throw new Error("Missing required flag: --profiles=5008819,5008813");
    }

    const result = await client.v23.getPresenceStates({ institutionProfileIds });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "config") {
    const childIds = parseCsvNumbers(getFlagValue(args, "children"));
    if (!childIds.length) {
      throw new Error("Missing required flag: --children=5008813,5011592");
    }

    const result = await client.v23.getPresenceConfigurationByChildIds({ childIds });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "closed-days") {
    const institutionCodes = parseCsvStrings(getFlagValue(args, "institutions"));
    if (!institutionCodes.length) {
      throw new Error("Missing required flag: --institutions=G17143");
    }

    const result = await client.v23.getPresenceClosedDays({ institutionCodes });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "opening-hours") {
    const institutionCodes = parseCsvStrings(getFlagValue(args, "institutions"));
    const startDate = getFlagValue(args, "start-date");
    const endDate = getFlagValue(args, "end-date");
    if (!institutionCodes.length || !startDate || !endDate) {
      throw new Error("Usage: presence opening-hours --institutions=G17143 --start-date=2026-03-02 --end-date=2026-03-08");
    }

    const result = await client.v23.getPresenceOpeningHoursByInstitutionCodes({
      institutionCodes,
      startDate,
      endDate
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(
    "Usage: presence daily-overview|states|config|closed-days|opening-hours [flags], run --help to see examples"
  );
};
