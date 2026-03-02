import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAulaApiClient, type BrowserStorageState, type SessionState } from "@aula/api-client";

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
    sessionPath: sessionArg ? sessionArg.slice("--session=".length) : ".aula/latest-storage-state.json",
    baseUrl: baseUrlArg ? baseUrlArg.slice("--base-url=".length) : "https://www.aula.dk",
    query
  };
};

export const runFetchCommand = async (args: string[]): Promise<void> => {
  const parsed = parseArgs(args);
  const sessionPath = resolve(parsed.sessionPath);
  const storageStateRaw = await readFile(sessionPath, "utf8");
  const storageState = JSON.parse(storageStateRaw) as BrowserStorageState;

  const session: SessionState = {
    baseUrl: parsed.baseUrl,
    storageState
  };

  const client = createAulaApiClient(session);
  const data = await client.discovered.get<unknown>(parsed.path, parsed.query);
  console.log(JSON.stringify(data, null, 2));
};
