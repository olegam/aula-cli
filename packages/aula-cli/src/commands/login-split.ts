import { readFile, unlink, lstat, open, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createAulaApiClient, type SessionState } from "@aula/api-client";
import { AULA_CLIENT_ID, AULA_SCOPE, AULA_REDIRECT_URI, AULA_TOKEN_ENDPOINT, createPkcePair, createRandomState, buildAuthorizeUrl, exchangeAuthorizationCode } from "./login";
import { getStateDir, getDefaultSessionPath } from "../shared/paths";
import { writePrivateJson } from "../shared/private-files";
import { saveSessionState } from "../shared/session";
import { getFlagValue } from "../shared/args";
import { buildBootstrapData, saveBootstrapData } from "./bootstrap";

type Pending = { state: string; codeVerifier: string; createdAt: number };
export function validateCallback(callback: string, pending: Pending): string {
  if (!pending || typeof pending.state !== "string" || !pending.state || typeof pending.codeVerifier !== "string" || !pending.codeVerifier || !Number.isFinite(pending.createdAt)) throw new Error("Invalid pending login state; start again.");
  let url: URL;
  try { url = new URL(callback.trim()); } catch { throw new Error("Invalid callback URL."); }
  const expected = new URL(AULA_REDIRECT_URI);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw new Error("Unexpected callback destination.");
  if (Date.now() - pending.createdAt > 15 * 60_000 || pending.createdAt > Date.now()) throw new Error("Login request expired; start again.");
  if (url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== pending.state) throw new Error("OAuth state mismatch.");
  if (url.searchParams.has("error")) throw new Error("Aula authorization was declined or failed.");
  const code = url.searchParams.get("code");
  if (url.searchParams.getAll("code").length !== 1 || !code) throw new Error("Authorization code missing or ambiguous.");
  return code;
}

export async function runSplitLoginCommand(args: string[]): Promise<void> {
  const pendingPath = resolve(getStateDir(), "pending-login.json");
  if (args[0] === "start") {
    const {codeVerifier, codeChallenge} = createPkcePair();
    const state = createRandomState();
    await mkdir(getStateDir(), { recursive: true, mode: 0o700 });
    const lockPath = `${pendingPath}.lock`;
    const lock = await open(lockPath, "wx", 0o600);
    try {
      await writePrivateJson(pendingPath, {state, codeVerifier, createdAt: Date.now()});
    } finally { await lock.close(); await unlink(lockPath); }
    // Only this intentionally public authorization URL is emitted. Never emit a callback URL.
    console.log(buildAuthorizeUrl(state, codeChallenge));
    return;
  }
  if (args[0] !== "complete") throw new Error("Use login-split start or login-split complete (callback on stdin or --callback-file=private-file).");
  const callbackFile = getFlagValue(args, "callback-file");
  if (callbackFile) {
    const info = await lstat(callbackFile);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error("Callback file must be private.");
  }
  const callback = callbackFile ? await readFile(callbackFile, "utf8") : await Bun.stdin.text();
  // Exclusively lock completion; successful exchange consumes pending state.
  const lockPath = `${pendingPath}.lock`;
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const pendingInfo = await lstat(pendingPath);
    if (!pendingInfo.isFile() || pendingInfo.isSymbolicLink() || (pendingInfo.mode & 0o077)) throw new Error("Pending login file must be private.");
    const pending = JSON.parse(await readFile(pendingPath, "utf8")) as Pending;
    const code = validateCallback(callback, pending);
    const tokenSet = await exchangeAuthorizationCode(code, pending.codeVerifier);
    const session: SessionState = { baseUrl: "https://www.aula.dk", auth: {
      clientId: AULA_CLIENT_ID, tokenEndpoint: AULA_TOKEN_ENDPOINT, redirectUri: AULA_REDIRECT_URI, scope: AULA_SCOPE,
      tokenType: tokenSet.tokenType, accessToken: tokenSet.accessToken, refreshToken: tokenSet.refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + tokenSet.expiresIn * 1000).toISOString()
    }, capturedAt: new Date().toISOString() };
    const sessionPath = resolve(getFlagValue(args, "session") ?? getDefaultSessionPath());
    session.persist = (next) => saveSessionState(sessionPath, next);
    await saveSessionState(sessionPath, session);
    await unlink(pendingPath);
    if (callbackFile) await unlink(callbackFile);
    console.log("Aula session saved privately.");
    const client = createAulaApiClient(session);
    const profiles = await client.v23.getProfilesByLogin();
    const context = await client.v23.getProfileContext();
    await saveBootstrapData(buildBootstrapData(profiles.data, context.data));
    console.log("Bootstrap saved privately.");
  } finally { await lock.close(); await unlink(lockPath); }
}
