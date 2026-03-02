import { readFile } from "node:fs/promises";
import { getDefaultBootstrapPath } from "./paths";

type BootstrapDefaults = {
  profileIds: number[];
  childIds: number[];
  institutionCodes: string[];
};

const emptyDefaults: BootstrapDefaults = {
  profileIds: [],
  childIds: [],
  institutionCodes: []
};

export const getBootstrapDefaults = async (): Promise<BootstrapDefaults> => {
  try {
    const raw = await readFile(getDefaultBootstrapPath(), "utf8");
    const parsed = JSON.parse(raw) as {
      profileIds?: unknown;
      childIds?: unknown;
      institutionCodes?: unknown;
    };

    const profileIds = Array.isArray(parsed.profileIds)
      ? parsed.profileIds.filter((id): id is number => typeof id === "number")
      : [];
    const childIds = Array.isArray(parsed.childIds)
      ? parsed.childIds.filter((id): id is number => typeof id === "number")
      : [];
    const institutionCodes = Array.isArray(parsed.institutionCodes)
      ? parsed.institutionCodes.filter((code): code is string => typeof code === "string")
      : [];

    return {
      profileIds,
      childIds,
      institutionCodes
    };
  } catch {
    return emptyDefaults;
  }
};
