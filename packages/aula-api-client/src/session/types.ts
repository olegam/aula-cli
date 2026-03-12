export type StorageCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export type OriginStorage = {
  origin: string;
  localStorage: Array<{
    name: string;
    value: string;
  }>;
};

export type BrowserStorageState = {
  cookies: StorageCookie[];
  origins: OriginStorage[];
};

export type TokenState = {
  clientId: string;
  tokenEndpoint: string;
  redirectUri: string;
  scope: string;
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
};

export type AulaSessionCookies = {
  phpSessionId?: string;
  csrfToken?: string;
  portalRole?: string;
  deviceId?: string;
  bootstrappedAt?: string;
};

export type SessionState = {
  baseUrl: string;
  auth?: TokenState;
  aulaSession?: AulaSessionCookies;
  storageState?: BrowserStorageState;
  headers?: Record<string, string>;
  capturedAt?: string;
  persist?: (session: SessionState) => Promise<void>;
};
