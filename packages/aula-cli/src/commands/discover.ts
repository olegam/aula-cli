import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startDiscoverySession } from "../discovery/playwrightSession";
import { getDefaultDiscoveryDir, getStateDir } from "../shared/paths";

const toTimestampFolder = (date: Date): string => {
  return date.toISOString().replace(/[:.]/g, "-");
};

export const runDiscoverCommand = async (args: string[]): Promise<void> => {
  const outputBaseFlag = args.find((arg) => arg.startsWith("--out="));
  const loginWaitFlag = args.find((arg) => arg.startsWith("--login-wait="));
  const browseWaitFlag = args.find((arg) => arg.startsWith("--browse-wait="));
  const outputBaseDir = outputBaseFlag ? outputBaseFlag.slice("--out=".length) : getDefaultDiscoveryDir();
  const outputDir = resolve(outputBaseDir, toTimestampFolder(new Date()));
  const loginWaitSeconds = loginWaitFlag ? Number.parseInt(loginWaitFlag.slice("--login-wait=".length), 10) : undefined;
  const browseWaitSeconds = browseWaitFlag
    ? Number.parseInt(browseWaitFlag.slice("--browse-wait=".length), 10)
    : undefined;

  await mkdir(outputDir, { recursive: true });

  const sessionOptions: Parameters<typeof startDiscoverySession>[0] = {
    outputDir
  };

  if (typeof loginWaitSeconds === "number" && Number.isFinite(loginWaitSeconds)) {
    sessionOptions.loginWaitSeconds = loginWaitSeconds;
  }

  if (typeof browseWaitSeconds === "number" && Number.isFinite(browseWaitSeconds)) {
    sessionOptions.browseWaitSeconds = browseWaitSeconds;
  }

  const result = await startDiscoverySession(sessionOptions);

  const stateDir = resolve(getStateDir());
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, "latest-capture-dir.txt"), `${result.outputDir}\n`, "utf8");

  console.log("Discovery capture completed.");
  console.log(`Output directory: ${result.outputDir}`);
  console.log(`Requests: ${result.requestsPath}`);
  console.log(`Responses: ${result.responsesPath}`);
  console.log(`Endpoint catalog: ${result.endpointCatalogPath}`);
  console.log(`Storage state: ${result.storageStatePath}`);
  if (result.interruptedBySignal) {
    console.log(`Capture finalized after signal: ${result.interruptedBySignal}`);
  }
};
