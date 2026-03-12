import { randomUUID } from "node:crypto";
import type { AulaApiResponse } from "../endpoints/v23";
import type { SessionState, TokenState } from "../session/types";

export type RequestConfig = {
  method?: "GET" | "POST" | "HEAD" | "OPTIONS";
  path: string;
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
};

export type HttpTransport = {
  request<T>(config: RequestConfig): Promise<T>;
};

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

const AULA_APP_HEADERS = {
  Authorization: "Basic Og==",
  "User-Agent": "iOS",
  "App-Version": "R2.15 B602754",
  "App-Device-Type": "Phone"
} as const;

const toUrl = (baseUrl: string, path: string, query?: RequestConfig["query"]): URL => {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
};

const toIsoAfterSeconds = (seconds: number): string => {
  return new Date(Date.now() + seconds * 1000).toISOString();
};

const isTokenExpiringSoon = (auth: TokenState): boolean => {
  const expiresAt = Date.parse(auth.accessTokenExpiresAt);
  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_SKEW_MS;
};

const getCurrentCookieState = (session: SessionState): {
  phpSessionId: string | undefined;
  csrfToken: string | undefined;
} => {
  if (session.aulaSession?.phpSessionId || session.aulaSession?.csrfToken) {
    return {
      phpSessionId: session.aulaSession.phpSessionId,
      csrfToken: session.aulaSession.csrfToken
    };
  }

  return {
    phpSessionId: getCookieValue(session, "PHPSESSID"),
    csrfToken: getCookieValue(session, "Csrfp-Token")
  };
};

const buildAulaSession = (
  session: SessionState,
  updates: Record<string, string | undefined>
): NonNullable<SessionState["aulaSession"]> => {
  const next = { ...(session.aulaSession ?? {}) } as Record<string, string>;

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete next[key];
      continue;
    }

    next[key] = value;
  }

  return next as NonNullable<SessionState["aulaSession"]>;
};

const cookieHeaderFromState = (session: SessionState): string | undefined => {
  const current = getCurrentCookieState(session);
  const cookies: string[] = [];
  if (current.csrfToken) {
    cookies.push(`Csrfp-Token=${current.csrfToken}`);
  }
  if (current.phpSessionId) {
    cookies.push(`PHPSESSID=${current.phpSessionId}`);
  }

  if (cookies.length > 0) {
    return cookies.join("; ");
  }

  const legacyCookies = session.storageState?.cookies ?? [];
  if (!legacyCookies.length) {
    return undefined;
  }

  return legacyCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
};

const getCookieValue = (session: SessionState, name: string): string | undefined => {
  const cookies = session.storageState?.cookies ?? [];
  const match = cookies.find((cookie) => cookie.name.toLowerCase() === name.toLowerCase());
  return match?.value;
};

const persistSession = async (session: SessionState): Promise<void> => {
  if (session.persist) {
    await session.persist(session);
  }
};

const readSetCookieHeaders = (headers: Headers): string[] => {
  const headerWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headerWithSetCookie.getSetCookie === "function") {
    return headerWithSetCookie.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
};

const updateSessionCookiesFromHeaders = (session: SessionState, headers: Headers): boolean => {
  const setCookies = readSetCookieHeaders(headers);
  if (setCookies.length === 0) {
    return false;
  }

  let nextPhpSessionId = session.aulaSession?.phpSessionId;
  let nextCsrfToken = session.aulaSession?.csrfToken;
  let changed = false;

  for (const value of setCookies) {
    const phpSessionMatch = value.match(/(?:^|,\\s*)PHPSESSID=([^;,\s]+)/i);
    if (phpSessionMatch && phpSessionMatch[1] !== nextPhpSessionId) {
      nextPhpSessionId = phpSessionMatch[1];
      changed = true;
    }

    const csrfMatch = value.match(/(?:^|,\\s*)Csrfp-Token=([^;,\s]+)/i);
    if (csrfMatch && csrfMatch[1] !== nextCsrfToken) {
      nextCsrfToken = csrfMatch[1];
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  session.aulaSession = buildAulaSession(session, {
    phpSessionId: nextPhpSessionId,
    csrfToken: nextCsrfToken
  });
  return true;
};

const readJsonResponse = async <T>(response: Response, url: URL): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url.toString()})`);
  }

  return (await response.json()) as T;
};

const choosePortalRole = (roles: string[]): string => {
  if (roles.includes("guardian")) {
    return "guardian";
  }
  if (roles.includes("employee")) {
    return "employee";
  }
  return roles[0] ?? "guardian";
};

const refreshAccessToken = async (session: SessionState): Promise<void> => {
  const auth = session.auth;
  if (!auth) {
    return;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken,
    client_id: auth.clientId
  });

  const response = await fetch(auth.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const tokenResponse = (await readJsonResponse<{
    token_type?: string;
    expires_in?: number;
    access_token?: string;
    refresh_token?: string;
  }>(response, new URL(auth.tokenEndpoint))) ?? {};

  if (
    typeof tokenResponse.access_token !== "string" ||
    typeof tokenResponse.refresh_token !== "string" ||
    typeof tokenResponse.expires_in !== "number"
  ) {
    throw new Error("Refresh token response from Aula was missing expected fields.");
  }

  session.auth = {
    ...auth,
    tokenType: tokenResponse.token_type ?? auth.tokenType,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    accessTokenExpiresAt: toIsoAfterSeconds(tokenResponse.expires_in)
  };
  session.aulaSession = buildAulaSession(session, {
    phpSessionId: undefined,
    csrfToken: undefined,
    bootstrappedAt: undefined
  });
  await persistSession(session);
};

const ensureFreshAccessToken = async (session: SessionState): Promise<void> => {
  if (!session.auth) {
    return;
  }

  if (!isTokenExpiringSoon(session.auth)) {
    return;
  }

  await refreshAccessToken(session);
};

const buildAuthenticatedHeaders = (session: SessionState, config: RequestConfig): Headers => {
  const headers = new Headers({
    Accept: "application/json, text/plain, */*",
    ...(session.auth ? AULA_APP_HEADERS : {}),
    ...session.headers,
    ...config.headers
  });

  const cookieHeader = cookieHeaderFromState(session);
  if (cookieHeader && !headers.has("Cookie")) {
    headers.set("Cookie", cookieHeader);
  }

  if ((config.method ?? "GET") === "POST" && !headers.has("csrfp-token")) {
    const csrfToken = getCurrentCookieState(session).csrfToken;
    if (csrfToken) {
      headers.set("csrfp-token", csrfToken);
    }
  }

  return headers;
};

const bootstrapAulaSession = async (session: SessionState): Promise<void> => {
  if (!session.auth) {
    return;
  }

  await ensureFreshAccessToken(session);

  const auth = session.auth;
  const profileTypesUrl = toUrl(session.baseUrl, "/api/v23/", {
    method: "profiles.getProfileTypesByLogin",
    access_token: auth.accessToken
  });
  const profileTypesResponse = await fetch(profileTypesUrl, {
    headers: buildAuthenticatedHeaders(session, {
      method: "GET",
      path: "/api/v23/"
    })
  });

  const profileTypesPayload = await readJsonResponse<AulaApiResponse<string[]>>(profileTypesResponse, profileTypesUrl);
  const cookiesChangedAfterRoles = updateSessionCookiesFromHeaders(session, profileTypesResponse.headers);

  const portalRole = choosePortalRole(profileTypesPayload.data ?? []);
  const deviceId = session.aulaSession?.deviceId ?? `IOS-private-${randomUUID().toUpperCase()}`;

  session.aulaSession = buildAulaSession(session, {
    portalRole,
    deviceId
  });

  const profileContextUrl = toUrl(session.baseUrl, "/api/v23/", {
    method: "profiles.getProfileContext",
    portalrole: portalRole,
    deviceId,
    access_token: auth.accessToken
  });
  const profileContextResponse = await fetch(profileContextUrl, {
    headers: buildAuthenticatedHeaders(session, {
      method: "GET",
      path: "/api/v23/"
    })
  });

  await readJsonResponse<AulaApiResponse<unknown>>(profileContextResponse, profileContextUrl);
  const cookiesChangedAfterContext = updateSessionCookiesFromHeaders(session, profileContextResponse.headers);

  session.aulaSession = buildAulaSession(session, {
    portalRole,
    deviceId,
    bootstrappedAt: new Date().toISOString()
  });

  if (cookiesChangedAfterRoles || cookiesChangedAfterContext) {
    await persistSession(session);
  }
};

const ensureAulaSession = async (session: SessionState): Promise<void> => {
  if (!session.auth) {
    return;
  }

  await ensureFreshAccessToken(session);

  if (session.aulaSession?.phpSessionId && session.aulaSession.csrfToken && session.aulaSession.portalRole) {
    return;
  }

  await bootstrapAulaSession(session);
};

const createRequestUrl = async (session: SessionState, config: RequestConfig): Promise<URL> => {
  await ensureAulaSession(session);

  const query = config.query ? { ...config.query } : {};
  if (session.auth && query.access_token === undefined) {
    query.access_token = session.auth.accessToken;
  }

  if (
    session.auth &&
    query.method === "profiles.getProfileContext" &&
    typeof session.aulaSession?.portalRole === "string" &&
    query.portalrole === undefined
  ) {
    query.portalrole = session.aulaSession.portalRole;
  }

  if (
    session.auth &&
    query.method === "profiles.getProfileContext" &&
    typeof session.aulaSession?.deviceId === "string" &&
    query.deviceId === undefined
  ) {
    query.deviceId = session.aulaSession.deviceId;
  }

  return toUrl(session.baseUrl, config.path, query);
};

const executeRequest = async <T>(session: SessionState, config: RequestConfig): Promise<T> => {
  const url = await createRequestUrl(session, config);
  const headers = buildAuthenticatedHeaders(session, config);

  let body: string | undefined;
  if (config.body !== undefined) {
    body = typeof config.body === "string" ? config.body : JSON.stringify(config.body);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const init: RequestInit = {
    method: config.method ?? "GET",
    headers
  };

  if (body !== undefined) {
    init.body = body;
  }

  const response = await fetch(url, init);
  const cookiesChanged = updateSessionCookiesFromHeaders(session, response.headers);
  if (cookiesChanged) {
    await persistSession(session);
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url.toString()})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
};

export const createFetchTransport = (session: SessionState): HttpTransport => {
  return {
    async request<T>(config: RequestConfig): Promise<T> {
      try {
        return await executeRequest<T>(session, config);
      } catch (error) {
        if (!(error instanceof Error) || !session.auth) {
          throw error;
        }

        if (!/Request failed: (401|403)\b/.test(error.message)) {
          throw error;
        }

        if (error.message.includes("401")) {
          await refreshAccessToken(session);
        } else {
          session.aulaSession = buildAulaSession(session, {
            phpSessionId: undefined,
            csrfToken: undefined,
            bootstrappedAt: undefined
          });
          await persistSession(session);
        }

        return executeRequest<T>(session, config);
      }
    }
  };
};
