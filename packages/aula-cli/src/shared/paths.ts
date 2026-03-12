import { homedir } from "node:os";
import { resolve } from "node:path";

export const getStateDir = (): string => {
  const fromEnv = process.env.AULA_CLI_HOME;
  if (fromEnv && fromEnv.trim()) {
    return resolve(fromEnv.trim());
  }
  return resolve(homedir(), ".aula-cli");
};

export const getDefaultSessionPath = (): string => {
  return resolve(getStateDir(), "session.json");
};

export const getDefaultBootstrapPath = (): string => {
  return resolve(getStateDir(), "bootstrap.json");
};

export const getDefaultDiscoveryDir = (): string => {
  return resolve(getStateDir(), "discovery");
};
