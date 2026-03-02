import { createDiscoveredEndpointClient } from "./endpoints/discovered";
import { createV23ReadClient } from "./endpoints/v23";
import { createFetchTransport } from "./http/transport";
import type { SessionState } from "./session/types";

export type { DiscoveredEndpoint } from "./endpoints/discovered";
export type { AulaApiResponse } from "./endpoints/v23";
export type { HttpTransport, RequestConfig } from "./http/transport";
export type { BrowserStorageState, OriginStorage, SessionState, StorageCookie } from "./session/types";

export const createAulaApiClient = (session: SessionState) => {
  const transport = createFetchTransport(session);
  const discovered = createDiscoveredEndpointClient(transport);
  const v23 = createV23ReadClient(transport);

  return {
    discovered,
    v23
  };
};
