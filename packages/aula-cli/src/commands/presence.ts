import { getFlagValue, parseCsvNumbers, parseCsvStrings } from "../shared/args";
import { getBootstrapDefaults } from "../shared/bootstrap-defaults";
import { printOutput } from "../shared/output";
import { createClientFromArgs } from "../shared/session";

export const runPresenceCommand = async (args: string[]): Promise<void> => {
  const subcommand = args[0];
  const client = await createClientFromArgs(args);
  const defaults = await getBootstrapDefaults();

  if (subcommand === "daily-overview") {
    const explicitChildren = parseCsvNumbers(getFlagValue(args, "children"));
    const childIds = explicitChildren.length ? explicitChildren : defaults.childIds;
    if (!childIds.length) {
      throw new Error("No child IDs found. Run `aula-cli login` first or pass --children=5008813,5011592");
    }

    const result = await client.v23.getPresenceDailyOverview({ childIds });
    printOutput(result, args, {
      importantFields: [
        "institutionProfile.fullName",
        "mainGroup.name",
        "status",
        "checkInTime",
        "checkOutTime",
        "entryTime",
        "exitTime",
        "location",
        "comment"
      ]
    });
    return;
  }

  if (subcommand === "states") {
    const explicitProfiles = parseCsvNumbers(getFlagValue(args, "profiles"));
    const defaultPresenceProfiles = defaults.childIds.length ? defaults.childIds : defaults.profileIds;
    const institutionProfileIds = explicitProfiles.length ? explicitProfiles : defaultPresenceProfiles;
    if (!institutionProfileIds.length) {
      throw new Error("No profile IDs found. Run `aula-cli login` first or pass --profiles=5008819,5008813");
    }

    const result = await client.v23.getPresenceStates({ institutionProfileIds });
    printOutput(result, args, {
      importantFields: ["id", "status", "location", "checkInTime", "checkOutTime", "institutionProfile.fullName"]
    });
    return;
  }

  if (subcommand === "config") {
    const explicitChildren = parseCsvNumbers(getFlagValue(args, "children"));
    const childIds = explicitChildren.length ? explicitChildren : defaults.childIds;
    if (!childIds.length) {
      throw new Error("No child IDs found. Run `aula-cli login` first or pass --children=5008813,5011592");
    }

    const result = await client.v23.getPresenceConfigurationByChildIds({ childIds });
    printOutput(result, args, {
      importantFields: ["childInstitutionProfileId", "settings", "id", "institutionCode"]
    });
    return;
  }

  if (subcommand === "closed-days") {
    const explicitInstitutions = parseCsvStrings(getFlagValue(args, "institutions"));
    const institutionCodes = explicitInstitutions.length ? explicitInstitutions : defaults.institutionCodes;
    if (!institutionCodes.length) {
      throw new Error("No institution codes found. Run `aula-cli login` first or pass --institutions=G17143");
    }

    const result = await client.v23.getPresenceClosedDays({ institutionCodes });
    printOutput(result, args, {
      importantFields: ["date", "title", "closed", "institutionCode"]
    });
    return;
  }

  if (subcommand === "opening-hours") {
    const explicitInstitutions = parseCsvStrings(getFlagValue(args, "institutions"));
    const institutionCodes = explicitInstitutions.length ? explicitInstitutions : defaults.institutionCodes;
    const startDate = getFlagValue(args, "start-date");
    const endDate = getFlagValue(args, "end-date");
    if (!institutionCodes.length || !startDate || !endDate) {
      throw new Error(
        "Usage: presence opening-hours [--institutions=G17143] --start-date=2026-03-02 --end-date=2026-03-08 (institutions default from bootstrap)"
      );
    }

    const result = await client.v23.getPresenceOpeningHoursByInstitutionCodes({
      institutionCodes,
      startDate,
      endDate
    });
    printOutput(result, args, {
      importantFields: ["date", "openingHours", "institutionCode", "startTime", "endTime"]
    });
    return;
  }

  throw new Error(
    "Usage: presence daily-overview|states|config|closed-days|opening-hours [flags], run --help to see examples"
  );
};
