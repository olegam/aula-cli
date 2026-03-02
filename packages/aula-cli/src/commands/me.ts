import { createClientFromArgs } from "../shared/session";

export const runMeCommand = async (args: string[]): Promise<void> => {
  const client = await createClientFromArgs(args);
  const [profiles, context] = await Promise.all([client.v23.getProfilesByLogin(), client.v23.getProfileContext()]);

  console.log(
    JSON.stringify(
      {
        profiles,
        context
      },
      null,
      2
    )
  );
};
