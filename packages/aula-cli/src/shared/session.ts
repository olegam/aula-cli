import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createAulaApiClient, type BrowserStorageState, type SessionState } from "@aula/api-client";
import { getFlagValue } from "./args";
import { getDefaultSessionPath } from "./paths";

const isBrowserStorageState = (value: unknown): value is BrowserStorageState => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.cookies) && Array.isArray(record.origins);
};

const stripPersist = (session: SessionState): SessionState => {
  const { persist: _persist, ...rest } = session;
  return rest;
};

export const saveSessionState = async (sessionPath: string, session: SessionState): Promise<void> => {
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, JSON.stringify(stripPersist(session), null, 2), "utf8");
};

export const loadSessionState = async (sessionPath: string, baseUrl: string): Promise<SessionState> => {
  const raw = await readFile(sessionPath, "utf8");
  const parsed = JSON.parse(raw) as SessionState | BrowserStorageState;

  if (isBrowserStorageState(parsed)) {
    return {
      baseUrl,
      storageState: parsed
    };
  }

  return {
    ...parsed,
    baseUrl
  };
};

export const createClientFromArgs = async (args: string[]) => {
  const sessionPath = resolve(getFlagValue(args, "session") ?? getDefaultSessionPath());
  const baseUrl = getFlagValue(args, "base-url") ?? "https://www.aula.dk";
  const session = await loadSessionState(sessionPath, baseUrl);
  session.persist = async (nextSession) => {
    await saveSessionState(sessionPath, nextSession);
  };

  return createAulaApiClient(session);
};
