import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClientFromArgs } from "../shared/session";
import { getDefaultBootstrapPath, getStateDir } from "../shared/paths";
import { printOutput } from "../shared/output";

type TraverseState = {
  profileIds: Set<number>;
  childIds: Set<number>;
  institutionCodes: Set<string>;
};

const maybeAddByRole = (node: Record<string, unknown>, state: TraverseState) => {
  const role = typeof node.role === "string" ? node.role.toLowerCase() : undefined;
  const id = typeof node.id === "number" ? node.id : undefined;
  const institutionCode = typeof node.institutionCode === "string" ? node.institutionCode : undefined;

  if (institutionCode) {
    state.institutionCodes.add(institutionCode);
  }

  if (role === "child" && id !== undefined) {
    state.childIds.add(id);
    state.profileIds.add(id);
    return;
  }

  if ((role === "guardian" || role === "employee") && id !== undefined) {
    state.profileIds.add(id);
  }
};

const maybeAddByKey = (key: string, value: unknown, state: TraverseState) => {
  if (typeof value === "number") {
    if (/^(institutionProfileId|instProfileId|instProfileIds\[\])$/i.test(key)) {
      state.profileIds.add(value);
    }
    if (/^(childId|childIds\[\])$/i.test(key)) {
      state.childIds.add(value);
    }
  }

  if (Array.isArray(value)) {
    if (/^(institutionProfileIds\[\]|instProfileIds\[\])$/i.test(key)) {
      for (const item of value) {
        if (typeof item === "number") {
          state.profileIds.add(item);
        }
      }
    }
    if (/^(childIds\[\])$/i.test(key)) {
      for (const item of value) {
        if (typeof item === "number") {
          state.childIds.add(item);
        }
      }
    }
  }

  if (typeof value === "string" && /^institutionCode$/i.test(key)) {
    state.institutionCodes.add(value);
  }
};

const traverse = (value: unknown, state: TraverseState, seen: WeakSet<object>) => {
  if (!value || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      traverse(item, state, seen);
    }
    return;
  }

  const node = value as Record<string, unknown>;
  maybeAddByRole(node, state);

  for (const [key, child] of Object.entries(node)) {
    maybeAddByKey(key, child, state);
    traverse(child, state, seen);
  }
};

export type BootstrapData = {
  profileIds: number[];
  childIds: number[];
  institutionCodes: string[];
  suggestedFlags: {
    posts: string;
    notifications: string;
    presence: string;
    calendarEvents: string;
  };
};

export const buildBootstrapData = (profilesData: unknown, contextData: unknown): BootstrapData => {
  const state: TraverseState = {
    profileIds: new Set<number>(),
    childIds: new Set<number>(),
    institutionCodes: new Set<string>()
  };

  const seen = new WeakSet<object>();
  traverse(profilesData, state, seen);
  traverse(contextData, state, seen);

  const profileIds = [...state.profileIds].sort((a, b) => a - b);
  const childIds = [...state.childIds].sort((a, b) => a - b);
  const institutionCodes = [...state.institutionCodes].sort((a, b) => a.localeCompare(b));

  return {
    profileIds,
    childIds,
    institutionCodes,
    suggestedFlags: {
      posts: `--profiles=${profileIds.join(",")}`,
      notifications: `--children=${childIds.join(",")} --institutions=${institutionCodes.join(",")}`,
      presence: `--children=${childIds.join(",")} --profiles=${profileIds.join(",")} --institutions=${institutionCodes.join(",")}`,
      calendarEvents: `--profiles=${profileIds.join(",")}`
    }
  };
};

export const saveBootstrapData = async (bootstrap: BootstrapData, outputPath = getDefaultBootstrapPath()) => {
  const outputDir = resolve(getStateDir());
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, JSON.stringify(bootstrap, null, 2), "utf8");
  return outputPath;
};

export const runBootstrapCommand = async (args: string[]): Promise<void> => {
  const client = await createClientFromArgs(args);
  const [profilesResponse, contextResponse] = await Promise.all([
    client.v23.getProfilesByLogin(),
    client.v23.getProfileContext()
  ]);

  const bootstrap = buildBootstrapData(profilesResponse.data, contextResponse.data);
  const outputPath = await saveBootstrapData(bootstrap);

  printOutput(bootstrap, args, {
    importantFields: ["profileIds", "childIds", "institutionCodes"]
  });
  console.log(`Saved bootstrap hints to ${outputPath}`);
};
