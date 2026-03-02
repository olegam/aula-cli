import { getFlagValue, parseCsvNumbers, parseCsvStrings } from "../shared/args";
import { getBootstrapDefaults } from "../shared/bootstrap-defaults";
import { printOutput } from "../shared/output";
import { createClientFromArgs } from "../shared/session";

export const runNotificationsCommand = async (args: string[]): Promise<void> => {
  const defaults = await getBootstrapDefaults();
  const explicitChildren = parseCsvNumbers(getFlagValue(args, "children"));
  const explicitInstitutions = parseCsvStrings(getFlagValue(args, "institutions"));
  const activeChildrenIds = explicitChildren.length ? explicitChildren : defaults.childIds;
  const activeInstitutionCodes = explicitInstitutions.length ? explicitInstitutions : defaults.institutionCodes;

  if (!activeChildrenIds.length || !activeInstitutionCodes.length) {
    throw new Error(
      "No child/institution IDs found. Run `aula-cli login` first or pass --children=1,2 and --institutions=CODE1,CODE2"
    );
  }

  const client = await createClientFromArgs(args);
  const result = await client.v23.getNotificationsForActiveProfile({
    activeChildrenIds,
    activeInstitutionCodes
  });

  printOutput(result, args, {
    importantFields: [
      "notificationEventType",
      "notificationArea",
      "triggered",
      "senderName",
      "relatedChildName",
      "messageText",
      "institutionCode"
    ]
  });
};
