import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createAulaApiClient, type SessionState } from "@aula/api-client";
import { chromium } from "playwright";
import { buildBootstrapData, saveBootstrapData } from "./bootstrap";
import { getFlagValue } from "../shared/args";
import { getDefaultSessionPath } from "../shared/paths";
import { saveSessionState } from "../shared/session";

const AULA_CLIENT_ID = "_99949a54b8b65423862aac1bf629599ed64231607a";
const AULA_SCOPE = "aula-sensitive";
const AULA_REDIRECT_URI = "https://app-private.aula.dk";
const AULA_AUTHORIZE_ENDPOINT = "https://login.aula.dk/simplesaml/module.php/oidc/authorize.php";
const AULA_TOKEN_ENDPOINT = "https://login.aula.dk/simplesaml/module.php/oidc/token.php";

const toBase64Url = (value: Buffer): string => {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const createPkcePair = (): { codeVerifier: string; codeChallenge: string } => {
  const codeVerifier = toBase64Url(randomBytes(48));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
};

const createRandomState = (): string => {
  return toBase64Url(randomBytes(18));
};

const buildAuthorizeUrl = (state: string, codeChallenge: string): string => {
  const url = new URL(AULA_AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("client_id", AULA_CLIENT_ID);
  url.searchParams.set("scope", AULA_SCOPE);
  url.searchParams.set("redirect_uri", AULA_REDIRECT_URI);
  return url.toString();
};

const exchangeAuthorizationCode = async (
  code: string,
  codeVerifier: string
): Promise<{
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: AULA_REDIRECT_URI,
    code_verifier: codeVerifier,
    client_id: AULA_CLIENT_ID
  });

  const response = await fetch(AULA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Aula token exchange failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    token_type?: string;
    expires_in?: number;
    access_token?: string;
    refresh_token?: string;
  };

  if (
    typeof payload.access_token !== "string" ||
    typeof payload.refresh_token !== "string" ||
    typeof payload.expires_in !== "number"
  ) {
    throw new Error("Aula token exchange returned an unexpected payload.");
  }

  return {
    tokenType: payload.token_type ?? "Bearer",
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in
  };
};

export const runLoginCommand = async (args: string[]): Promise<void> => {
  const sessionPath = resolve(getFlagValue(args, "session") ?? getDefaultSessionPath());
  const waitSecondsRaw = getFlagValue(args, "wait");
  const waitSeconds =
    waitSecondsRaw !== undefined && Number.isFinite(Number.parseInt(waitSecondsRaw, 10))
      ? Number.parseInt(waitSecondsRaw, 10)
      : undefined;
  const { codeVerifier, codeChallenge } = createPkcePair();
  const state = createRandomState();
  const authorizeUrl = buildAuthorizeUrl(state, codeChallenge);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const redirectResponsePromise = page.waitForResponse(
      (response) => {
        if (response.status() !== 302) {
          return false;
        }

        const url = new URL(response.url());
        if (url.hostname !== "login.aula.dk" || url.pathname !== "/simplesaml/module.php/oidc/authorize.php") {
          return false;
        }

        const location = response.headers().location;
        return typeof location === "string" && location.startsWith(`${AULA_REDIRECT_URI}?`);
      },
      {
        timeout: waitSeconds !== undefined ? waitSeconds * 1000 : 0
      }
    );

    console.log("Opening Aula login page...");
    console.log("Complete MitID login in the browser window.");
    await page.goto(authorizeUrl, { waitUntil: "domcontentloaded" });

    const redirectResponse = await redirectResponsePromise;
    const location = redirectResponse.headers().location;
    if (!location) {
      throw new Error("Aula login completed, but the redirect location was missing.");
    }

    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get("code");
    const returnedState = redirectUrl.searchParams.get("state");
    if (!code) {
      throw new Error("Aula login completed, but no authorization code was returned.");
    }
    if (returnedState !== state) {
      throw new Error("Aula login completed, but the OAuth state did not match.");
    }

    const tokenSet = await exchangeAuthorizationCode(code, codeVerifier);
    const session: SessionState = {
      baseUrl: "https://www.aula.dk",
      auth: {
        clientId: AULA_CLIENT_ID,
        tokenEndpoint: AULA_TOKEN_ENDPOINT,
        redirectUri: AULA_REDIRECT_URI,
        scope: AULA_SCOPE,
        tokenType: tokenSet.tokenType,
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + tokenSet.expiresIn * 1000).toISOString()
      },
      capturedAt: new Date().toISOString()
    };

    session.persist = async (nextSession) => {
      await saveSessionState(sessionPath, nextSession);
    };
    await saveSessionState(sessionPath, session);
    console.log(`Session saved to ${sessionPath}`);

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
