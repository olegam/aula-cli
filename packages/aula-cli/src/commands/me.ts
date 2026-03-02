import { createClientFromArgs } from "../shared/session";
import { printOutput } from "../shared/output";

export const runMeCommand = async (args: string[]): Promise<void> => {
  const client = await createClientFromArgs(args);
  const [profiles, context] = await Promise.all([client.v23.getProfilesByLogin(), client.v23.getProfileContext()]);

  const profileList = ((profiles.data as { profiles?: unknown[] } | null)?.profiles ?? []) as Array<Record<string, unknown>>;
  const primaryProfile = profileList[0] ?? {};
  const children = (primaryProfile.children as Array<Record<string, unknown>> | undefined) ?? [];
  const guardians = (primaryProfile.institutionProfiles as Array<Record<string, unknown>> | undefined) ?? [];

  const summary = {
    portalRole: (context.data as { portalRole?: string } | null)?.portalRole ?? "",
    children: children.map((child) => ({
      id: child.id,
      name: child.name,
      shortName: child.shortName,
      institutionCode: child.institutionCode
    })),
    guardians: guardians.map((guardian) => ({
      id: guardian.id,
      fullName: guardian.fullName,
      institutionCode: guardian.institutionCode
    }))
  };

  printOutput(summary, args, {
    importantFields: ["id", "name", "shortName", "institutionCode", "fullName"]
  });
};
