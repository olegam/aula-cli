import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright";
import type { CapturedRequest, CapturedResponse } from "./captureWriter";
import { createCaptureWriter, redactRecord, redactText } from "./captureWriter";

type StartDiscoveryOptions = {
  outputDir: string;
  baseUrl?: string;
  hostPattern?: RegExp;
  loginWaitSeconds?: number;
  browseWaitSeconds?: number;
};

const waitForEnter = async (prompt: string): Promise<void> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await rl.question(prompt);
  rl.close();
};

const getRequestId = (request: { method(): string; url(): string; timing(): { startTime: number } }): string => {
  return `${request.method()} ${request.url()} ${request.timing().startTime}`;
};

const toHeadersObject = (headers: Record<string, string>): Record<string, string> => {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    next[key.toLowerCase()] = value;
  }
  return next;
};

const shouldCaptureRequest = (url: URL, resourceType: string, hostPattern: RegExp): boolean => {
  const networkTypeMatch = resourceType === "xhr" || resourceType === "fetch";
  return networkTypeMatch && hostPattern.test(url.hostname);
};

export const startDiscoverySession = async (options: StartDiscoveryOptions) => {
  const baseUrl = options.baseUrl ?? "https://www.aula.dk";
  const hostPattern = options.hostPattern ?? /(^|\.)aula\.dk$/i;
  const captureWriter = await createCaptureWriter(options.outputDir);
  const storageStatePath = join(options.outputDir, "storage-state.json");
  let interruptedBySignal: NodeJS.Signals | undefined;
  let resolveShutdown: (() => void) | undefined;
  const shutdownRequested = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  const onSignal = (signal: NodeJS.Signals) => {
    if (interruptedBySignal) {
      return;
    }
    interruptedBySignal = signal;
    console.log(`Received ${signal}. Finalizing capture...`);
    resolveShutdown?.();
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  let persistInFlight = false;

  const persistSnapshot = async () => {
    if (persistInFlight) {
      return;
    }

    persistInFlight = true;
    try {
      const storageState = await context.storageState();
      await writeFile(storageStatePath, JSON.stringify(storageState, null, 2), "utf8");
      await captureWriter.finalize();
    } finally {
      persistInFlight = false;
    }
  };

  await persistSnapshot();
  const periodicPersistTimer = setInterval(() => {
    void persistSnapshot();
  }, 15_000);

  page.on("request", async (request) => {
    try {
      const url = new URL(request.url());
      if (!shouldCaptureRequest(url, request.resourceType(), hostPattern)) {
        return;
      }

      const entry: CapturedRequest = {
        id: getRequestId(request),
        timestamp: new Date().toISOString(),
        method: request.method(),
        host: url.hostname,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: redactRecord(toHeadersObject(request.headers()))
      };

      const postData = redactText(request.postData() ?? undefined);
      if (postData) {
        entry.postData = postData;
      }

      await captureWriter.writeRequest(entry);
    } catch (error) {
      console.error("Failed to capture request:", error);
    }
  });

  page.on("response", async (response) => {
    try {
      const request = response.request();
      const url = new URL(response.url());
      if (!shouldCaptureRequest(url, request.resourceType(), hostPattern)) {
        return;
      }

      let bodyPreview: string | undefined;
      try {
        const bodyText = await response.text();
        bodyPreview = redactText(bodyText.slice(0, 3_000));
      } catch {
        bodyPreview = undefined;
      }

      const entry: CapturedResponse = {
        requestId: getRequestId(request),
        timestamp: new Date().toISOString(),
        status: response.status(),
        statusText: response.statusText(),
        headers: redactRecord(toHeadersObject(response.headers()))
      };

      if (bodyPreview) {
        entry.bodyPreview = bodyPreview;
      }

      await captureWriter.writeResponse(entry);
    } catch (error) {
      console.error("Failed to capture response:", error);
    }
  });

  try {
    console.log("Opening Aula login page in a headed Playwright browser...");
    await Promise.race([page.goto(baseUrl, { waitUntil: "domcontentloaded" }), shutdownRequested]);

    if (!interruptedBySignal) {
      console.log("Complete MitID login in the browser.");
      if (options.loginWaitSeconds !== undefined) {
        console.log(`Waiting ${options.loginWaitSeconds} seconds for login...`);
        await Promise.race([page.waitForTimeout(options.loginWaitSeconds * 1000), shutdownRequested]);
      } else {
        await Promise.race([waitForEnter("Press Enter here once login is completed..."), shutdownRequested]);
      }
    }

    if (!interruptedBySignal) {
      console.log("Capture is active. Browse Aula now to trigger API traffic.");
      if (options.browseWaitSeconds !== undefined) {
        console.log(`Waiting ${options.browseWaitSeconds} seconds for browsing capture...`);
        await Promise.race([page.waitForTimeout(options.browseWaitSeconds * 1000), shutdownRequested]);
      } else {
        await Promise.race([waitForEnter("Press Enter when you are done browsing..."), shutdownRequested]);
      }
    }

    await persistSnapshot();
    await browser.close();

    return {
      outputDir: captureWriter.outputDir,
      requestsPath: captureWriter.requestsPath,
      responsesPath: captureWriter.responsesPath,
      endpointCatalogPath: captureWriter.endpointCatalogPath,
      metadataPath: captureWriter.metadataPath,
      storageStatePath,
      interruptedBySignal
    };
  } finally {
    clearInterval(periodicPersistTimer);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
};
