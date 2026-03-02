import type { SessionState } from "../session/types";

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

const cookieHeaderFromState = (session: SessionState): string | undefined => {
  const cookies = session.storageState?.cookies ?? [];
  if (!cookies.length) {
    return undefined;
  }
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
};

export const createFetchTransport = (session: SessionState): HttpTransport => {
  return {
    async request<T>(config: RequestConfig): Promise<T> {
      const url = toUrl(session.baseUrl, config.path, config.query);
      const cookieHeader = cookieHeaderFromState(session);

      const headers = new Headers({
        Accept: "application/json, text/plain, */*",
        ...session.headers,
        ...config.headers
      });

      if (cookieHeader && !headers.has("Cookie")) {
        headers.set("Cookie", cookieHeader);
      }

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

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText} (${url.toString()})`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await response.json()) as T;
      }

      return (await response.text()) as T;
    }
  };
};
