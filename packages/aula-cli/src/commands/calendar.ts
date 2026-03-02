import { getFlagValue, getNumberFlag, parseCsvNumbers } from "../shared/args";
import { createClientFromArgs } from "../shared/session";

export const runCalendarCommand = async (args: string[]): Promise<void> => {
  const subcommand = args[0];
  const client = await createClientFromArgs(args);

  if (subcommand === "important-dates") {
    const result = await client.v23.getImportantDates({
      limit: getNumberFlag(args, "limit", 11),
      includeToday: (getFlagValue(args, "include-today") ?? "false") === "true"
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (subcommand === "events") {
    const instProfileIds = parseCsvNumbers(getFlagValue(args, "profiles"));
    const start = getFlagValue(args, "start");
    const end = getFlagValue(args, "end");

    if (!instProfileIds.length || !start || !end) {
      throw new Error(
        "Usage: calendar events --profiles=5001,5002 --start='2026-03-02 00:00:00.0000+01:00' --end='2026-03-03 00:00:00.0000+01:00'"
      );
    }

    const result = await client.v23.getCalendarEvents({
      instProfileIds,
      start,
      end
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error("Usage: calendar important-dates [--limit=11] [--include-today=true|false] OR calendar events ...");
};
