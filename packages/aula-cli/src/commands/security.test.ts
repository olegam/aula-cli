import { test, expect, mock } from "bun:test";
import { mkdtemp, stat, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateCallback } from "./login-split";
import { writePrivateJson } from "../shared/private-files";
import { assertReadRequest, createFetchTransport } from "../../../aula-api-client/src/http/transport";

const pending = () => ({state: "test-state", codeVerifier: "synthetic-test-verifier", createdAt: Date.now()});
test("callback validates exact HTTPS destination and state", () => {
  expect(validateCallback("https://app-private.aula.dk/?code=test-code&state=test-state", pending())).toBe("test-code");
  for (const url of [
    "http://app-private.aula.dk/?code=x&state=test-state",
    "https://app-private.aula.dk.evil.example/?code=x&state=test-state",
    "https://app-private.aula.dk/other?code=x&state=test-state",
    "https://user:password@app-private.aula.dk/?code=x&state=test-state",
    "https://app-private.aula.dk/?code=x&state=wrong",
    "https://app-private.aula.dk/?code=x&state=test-state&state=test-state",
    "https://app-private.aula.dk/?code=x&code=y&state=test-state",
    "https://app-private.aula.dk/?code=x&state=test-state#fragment"
  ]) expect(() => validateCallback(url, pending())).toThrow();
  expect(() => validateCallback("https://app-private.aula.dk/?code=x&state=test-state", {...pending(), createdAt: 0})).toThrow();
  for (const createdAt of [NaN, Infinity, undefined, "yesterday"]) {
    expect(() => validateCallback("https://app-private.aula.dk/?code=x&state=test-state", { ...pending(), createdAt } as any)).toThrow("Invalid pending");
  }
});

test("split login start cannot overwrite a pending completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aula-login-lock-"));
  try {
    const pendingPath = join(directory, "pending-login.json");
    await writeFile(pendingPath, JSON.stringify(pending()), { mode: 0o600 });
    const before = await readFile(pendingPath, "utf8");
    await writeFile(`${pendingPath}.lock`, "", { mode: 0o600 });
    const result = Bun.spawnSync([process.execPath, new URL("../index.ts", import.meta.url).pathname, "login-split", "start"], {
      env: { ...process.env, AULA_CLI_HOME: directory }
    });
    expect(result.exitCode).toBe(1);
    expect(await readFile(pendingPath, "utf8")).toBe(before);
    expect(result.stdout.toString()).toBe("");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("private writes reject existing shared directories without changing permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aula-permissions-"));
  try {
    await chmod(directory, 0o755);
    await expect(writePrivateJson(join(directory, "session.json"), {})).rejects.toThrow("0700");
    expect((await stat(directory)).mode & 0o777).toBe(0o755);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("private writes are atomic, private, and preserve JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aula-test-"));
  try {
    const path = join(dir, "state", "session.json");
    await writePrivateJson(path, {synthetic: "one"});
    await writePrivateJson(path, {synthetic: "two"});
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir,"state"))).mode & 0o777).toBe(0o700);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({synthetic: "two"});
  } finally { await rm(dir, {recursive:true,force:true}); }
});
test("request allowlist blocks foreign hosts, write RPCs and unapproved POSTs", () => {
  const session = {baseUrl: "https://www.aula.dk"};
  expect(() => assertReadRequest(session, {path:"/api/v24/", query:{method:"messaging.getThreads"}})).not.toThrow();
  expect(() => assertReadRequest({baseUrl:"https://evil.example"}, {path:"https://www.aula.dk/api/v24/", query:{method:"messaging.getThreads"}})).toThrow();
  for (const config of [
    {path:"https://evil.example/api/v24/", query:{method:"messaging.getThreads"}},
    {path:"/api/v24/", query:{method:"messaging.deleteThread"}},
    {path:"/api/v24/", query:{method:"messaging.getThreads"}, method:"POST" as const},
    {path:"/api/v24/?method=messaging.deleteThread"},
    {path:"/other", query:{method:"messaging.getThreads"}}
  ]) expect(() => assertReadRequest(session,config)).toThrow();
});
test("network failures never expose credential URL and disable redirects", async () => {
  const original = globalThis.fetch;
  let redirect: RequestRedirect | undefined;
  let signal: AbortSignal | null | undefined;
  let calls = 0;
  globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
    redirect = init?.redirect;
    signal = init?.signal;
    calls++;
    throw new Error(`network failure ${input}`);
  }) as unknown as typeof fetch;
  try {
    const transport = createFetchTransport({baseUrl:"https://www.aula.dk"});
    const result = transport.request({path:"/api/v24/",query:{method:"messaging.getThreads",access_token:"FAKE_SECRET"}});
    await expect(result).rejects.toThrow("details suppressed");
    expect(redirect).toBe("error");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(calls).toBe(1);
  } finally { globalThis.fetch = original; }
});


test("safe CLI errors expose only local labels and numeric statuses", async () => {
  const { safeErrorMessage } = await import("../shared/errors");
  expect(safeErrorMessage(new Error("Request failed: 403"))).toBe("Request failed: 403");
  for (const value of ["Request failed: 403 secret", "https://media-prod.aula.dk/path?secret=abc", "network error token abc"]) expect(safeErrorMessage(new Error(value))).not.toContain(value);
});
