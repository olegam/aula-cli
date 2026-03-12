import { resolve } from "node:path";
import { createAulaApiClient } from "@aula/api-client";
import { getDefaultSessionPath } from "../shared/paths";
import { printOutput } from "../shared/output";
import { loadSessionState, saveSessionState } from "../shared/session";

const parseArgs = (args: string[]) => {
  const path = args[0];
  if (!path) {
    throw new Error("Missing endpoint path. Example: aula fetch /api/v17/some-endpoint");
  }

  const sessionArg = args.find((arg) => arg.startsWith("--session="));
  const baseUrlArg = args.find((arg) => arg.startsWith("--base-url="));
  const queryArg = args.find((arg) => arg.startsWith("--query="));

  const query: Record<string, string> = {};
  if (queryArg) {
    const pairs = queryArg.slice("--query=".length).split("&").filter(Boolean);
    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      if (key && value) {
        query[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
  }

  return {
    path,
    sessionPath: sessionArg ? sessionArg.slice("--session=".length) : getDefaultSessionPath(),
    baseUrl: baseUrlArg ? baseUrlArg.slice("--base-url=".length) : "https://www.aula.dk",
    query
  };
};

export const runFetchCommand = async (args: string[]): Promise<void> => {
  const parsed = parseArgs(args);
  const sessionPath = resolve(parsed.sessionPath);
  const session = await loadSessionState(sessionPath, parsed.baseUrl);
  session.persist = async (nextSession) => {
    await saveSessionState(sessionPath, nextSession);
  };

  const client = createAulaApiClient(session);
  const data = await client.discovered.get<unknown>(parsed.path, parsed.query);
  printOutput(data, args);
};
