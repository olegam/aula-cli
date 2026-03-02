import { getFlagValue, getNumberFlag, parseCsvNumbers } from "../shared/args";
import { getBootstrapDefaults } from "../shared/bootstrap-defaults";
import { printOutput } from "../shared/output";
import { createClientFromArgs } from "../shared/session";

const toAulaDateTime = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetRemainder = pad(absOffset % 60);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.0000${sign}${offsetHours}:${offsetRemainder}`;
};

const getDefaultCalendarRange = (): { start: string; end: string } => {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 50);

  return {
    start: toAulaDateTime(startDate),
    end: toAulaDateTime(endDate)
  };
};

export const runCalendarCommand = async (args: string[]): Promise<void> => {
  const subcommand = args[0];
  const client = await createClientFromArgs(args);

  if (subcommand === "important-dates") {
    const result = await client.v23.getImportantDates({
      limit: getNumberFlag(args, "limit", 11),
      includeToday: (getFlagValue(args, "include-today") ?? "false") === "true"
    });
    printOutput(result, args, {
      importantFields: ["id", "title", "startDateTime", "endDateTime", "allDay", "type", "responseStatus"]
    });
    return;
  }

  if (subcommand === "events") {
    const defaults = await getBootstrapDefaults();
    const explicitProfiles = parseCsvNumbers(getFlagValue(args, "profiles"));
    const instProfileIds = explicitProfiles.length ? explicitProfiles : defaults.profileIds;
    const rangeDefaults = getDefaultCalendarRange();
    const start = getFlagValue(args, "start") ?? rangeDefaults.start;
    const end = getFlagValue(args, "end") ?? rangeDefaults.end;

    if (!instProfileIds.length) {
      throw new Error(
        "Usage: calendar events [--profiles=5001,5002] [--start='2026-03-02 00:00:00.0000+01:00'] [--end='2026-04-21 00:00:00.0000+01:00'] (profiles default from bootstrap; date range defaults to next 50 days)"
      );
    }

    const result = await client.v23.getCalendarEvents({
      instProfileIds,
      start,
      end
    });
    printOutput(result, args, {
      importantFields: ["id", "title", "startDateTime", "endDateTime", "allDay", "type", "responseStatus"]
    });
    return;
  }

  throw new Error("Usage: calendar important-dates [--limit=11] [--include-today=true|false] OR calendar events ...");
};
