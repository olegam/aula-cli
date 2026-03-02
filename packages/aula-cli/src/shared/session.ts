import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAulaApiClient, type BrowserStorageState, type SessionState } from "@aula/api-client";
import { getFlagValue } from "./args";
import { getDefaultSessionPath } from "./paths";

export const createClientFromArgs = async (args: string[]) => {
  const sessionPath = resolve(getFlagValue(args, "session") ?? getDefaultSessionPath());
  const baseUrl = getFlagValue(args, "base-url") ?? "https://www.aula.dk";
  const storageStateRaw = await readFile(sessionPath, "utf8");
  const storageState = JSON.parse(storageStateRaw) as BrowserStorageState;

  const session: SessionState = {
    baseUrl,
    storageState
  };

  return createAulaApiClient(session);
};
