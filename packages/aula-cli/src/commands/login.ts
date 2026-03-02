import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { createAulaApiClient, type BrowserStorageState, type SessionState } from "@aula/api-client";
import { chromium } from "playwright";
import { buildBootstrapData, saveBootstrapData } from "./bootstrap";
import { getFlagValue } from "../shared/args";
import { getDefaultSessionPath } from "../shared/paths";

const waitForEnter = async (prompt: string): Promise<void> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  await rl.question(prompt);
  rl.close();
};

const parseLoginResult = (value: unknown): { ok: boolean; status: number; detail: string } => {
  if (!value || typeof value !== "object") {
    return { ok: false, status: -1, detail: "Invalid response shape from login check." };
  }

  const result = value as { status?: unknown; body?: unknown };
  const httpStatus = typeof result.status === "number" ? result.status : -1;
  const bodyText = typeof result.body === "string" ? result.body : "";

  try {
    const json = JSON.parse(bodyText) as {
      status?: { code?: number; message?: string };
    };
    const appCode = json.status?.code;
    const appMessage = json.status?.message ?? "";

    if (httpStatus === 200 && appCode === 0) {
      return { ok: true, status: httpStatus, detail: "Authenticated." };
    }

    return {
      ok: false,
      status: httpStatus,
      detail: `Aula status.code=${String(appCode)} ${appMessage}`.trim()
    };
  } catch {
    return {
      ok: false,
      status: httpStatus,
      detail: `Non-JSON response: ${bodyText.slice(0, 200)}`
    };
  }
};

export const runLoginCommand = async (args: string[]): Promise<void> => {
  const sessionPath = resolve(getFlagValue(args, "session") ?? getDefaultSessionPath());
  const waitSecondsRaw = getFlagValue(args, "wait");
  const waitSeconds =
    waitSecondsRaw !== undefined && Number.isFinite(Number.parseInt(waitSecondsRaw, 10))
      ? Number.parseInt(waitSecondsRaw, 10)
      : undefined;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("Opening Aula login page...");
    await page.goto("https://www.aula.dk", { waitUntil: "domcontentloaded" });

    if (waitSeconds !== undefined) {
      console.log(`Waiting ${waitSeconds} seconds for MitID login...`);
      await page.waitForTimeout(waitSeconds * 1000);
    } else {
      console.log("Complete MitID login in the browser.");
      await waitForEnter("Press Enter once login is complete...");
    }

    const validationResult = await page.evaluate(async () => {
      const response = await fetch("/api/v23/?method=profiles.getProfilesByLogin", {
        credentials: "include"
      });
      return {
        status: response.status,
        body: await response.text()
      };
    });

    const parsed = parseLoginResult(validationResult);
    if (!parsed.ok) {
      throw new Error(`Login validation failed (${parsed.status}). ${parsed.detail}`);
    }

    const storageState = await context.storageState();
    await mkdir(dirname(sessionPath), { recursive: true });
    await writeFile(sessionPath, JSON.stringify(storageState, null, 2), "utf8");
    console.log(`Session saved to ${sessionPath}`);

    const session: SessionState = {
      baseUrl: "https://www.aula.dk",
      storageState: storageState as BrowserStorageState
    };
    const client = createAulaApiClient(session);
    const [profilesResponse, contextResponse] = await Promise.all([
      client.v23.getProfilesByLogin(),
      client.v23.getProfileContext()
    ]);

    const bootstrap = buildBootstrapData(profilesResponse.data, contextResponse.data);
    const bootstrapPath = await saveBootstrapData(bootstrap);
    console.log(`Bootstrap data saved to ${bootstrapPath}`);
  } finally {
    await browser.close();
  }
};
