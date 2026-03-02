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

export type SessionState = {
  baseUrl: string;
  storageState?: BrowserStorageState;
  headers?: Record<string, string>;
  capturedAt?: string;
};
