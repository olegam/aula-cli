import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type CapturedRequest = {
  id: string;
  timestamp: string;
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  postData?: string;
};

export type CapturedResponse = {
  requestId: string;
  timestamp: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyPreview?: string;
};

export type EndpointCatalogEntry = {
  id: string;
  method: string;
  host: string;
  path: string;
  hitCount: number;
  lastStatus?: number;
};

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|jwt|password|secret|session|mitid)/i;

export const redactRecord = (record: Record<string, string>): Record<string, string> => {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    next[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : value;
  }
  return next;
};

export const redactText = (value?: string): string | undefined => {
  if (!value) {
    return value;
  }

  return value.replace(
    /("(?:authorization|cookie|token|jwt|password|secret|session|mitid)"\s*:\s*)"[^"]*"/gi,
    '$1"[REDACTED]"'
  );
};

const createEndpointId = (method: string, host: string, path: string): string => {
  return `${method.toUpperCase()} ${host}${path}`;
};

export const buildEndpointCatalog = (
  requests: CapturedRequest[],
  responses: CapturedResponse[]
): EndpointCatalogEntry[] => {
  const responseByRequestId = new Map<string, CapturedResponse>();
  for (const response of responses) {
    responseByRequestId.set(response.requestId, response);
  }

  const catalog = new Map<string, EndpointCatalogEntry>();
  for (const request of requests) {
    const id = createEndpointId(request.method, request.host, request.path);
    const current = catalog.get(id);
    const linkedResponse = responseByRequestId.get(request.id);

    if (!current) {
      const entry: EndpointCatalogEntry = {
        id,
        method: request.method.toUpperCase(),
        host: request.host,
        path: request.path,
        hitCount: 1
      };

      if (linkedResponse) {
        entry.lastStatus = linkedResponse.status;
      }

      catalog.set(id, entry);
      continue;
    }

    current.hitCount += 1;
    if (linkedResponse) {
      current.lastStatus = linkedResponse.status;
    }
  }

  return [...catalog.values()].sort((a, b) => {
    if (a.hitCount !== b.hitCount) {
      return b.hitCount - a.hitCount;
    }
    return a.id.localeCompare(b.id);
  });
};

export const createCaptureWriter = async (outputDir: string) => {
  await mkdir(outputDir, { recursive: true });

  const requestsPath = join(outputDir, "requests.ndjson");
  const responsesPath = join(outputDir, "responses.ndjson");
  const endpointCatalogPath = join(outputDir, "endpoint-catalog.json");
  const metadataPath = join(outputDir, "metadata.json");
  const requests: CapturedRequest[] = [];
  const responses: CapturedResponse[] = [];

  const writeRequest = async (entry: CapturedRequest) => {
    requests.push(entry);
    await appendFile(requestsPath, `${JSON.stringify(entry)}\n`, "utf8");
  };

  const writeResponse = async (entry: CapturedResponse) => {
    responses.push(entry);
    await appendFile(responsesPath, `${JSON.stringify(entry)}\n`, "utf8");
  };

  const finalize = async () => {
    const catalog = buildEndpointCatalog(requests, responses);
    await writeFile(endpointCatalogPath, JSON.stringify(catalog, null, 2), "utf8");
    await writeFile(
      metadataPath,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          requestCount: requests.length,
          responseCount: responses.length
        },
        null,
        2
      ),
      "utf8"
    );
  };

  return {
    outputDir,
    requestsPath,
    responsesPath,
    endpointCatalogPath,
    metadataPath,
    writeRequest,
    writeResponse,
    finalize
  };
};
