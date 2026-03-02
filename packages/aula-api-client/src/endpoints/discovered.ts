import type { HttpTransport } from "../http/transport";

export type DiscoveredEndpoint = {
  id: string;
  method: "GET" | "HEAD" | "OPTIONS";
  path: string;
  description?: string;
};

export type CallEndpointInput = {
  endpoint: DiscoveredEndpoint;
  query?: Record<string, string | number | boolean | undefined>;
};

export const createDiscoveredEndpointClient = (transport: HttpTransport) => {
  const call = async <T>(input: CallEndpointInput): Promise<T> => {
    const requestConfig: Parameters<HttpTransport["request"]>[0] = {
      method: input.endpoint.method,
      path: input.endpoint.path
    };

    if (input.query) {
      requestConfig.query = input.query;
    }

    return transport.request<T>(requestConfig);
  };

  const get = async <T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> => {
    const requestConfig: Parameters<HttpTransport["request"]>[0] = {
      method: "GET",
      path
    };

    if (query) {
      requestConfig.query = query;
    }

    return transport.request<T>(requestConfig);
  };

  return {
    call,
    get
  };
};
