import { describe, expect, test } from "bun:test";
import {
  buildEndpointCatalog,
  redactRecord,
  redactText,
  type CapturedRequest,
  type CapturedResponse
} from "./captureWriter";

describe("captureWriter", () => {
  test("redacts sensitive headers", () => {
    const result = redactRecord({
      authorization: "Bearer abc",
      "x-custom": "ok",
      cookie: "foo=bar"
    });

    expect(result.authorization).toBe("[REDACTED]");
    expect(result["x-custom"]).toBe("ok");
    expect(result.cookie).toBe("[REDACTED]");
  });

  test("builds endpoint catalog with hit counts and status", () => {
    const requests: CapturedRequest[] = [
      {
        id: "1",
        timestamp: "2026-03-02T00:00:00.000Z",
        method: "GET",
        host: "www.aula.dk",
        path: "/api/v17/messages",
        query: {},
        headers: {}
      },
      {
        id: "2",
        timestamp: "2026-03-02T00:00:01.000Z",
        method: "GET",
        host: "www.aula.dk",
        path: "/api/v17/messages",
        query: {},
        headers: {}
      }
    ];

    const responses: CapturedResponse[] = [
      {
        requestId: "2",
        timestamp: "2026-03-02T00:00:01.300Z",
        status: 200,
        statusText: "OK",
        headers: {}
      }
    ];

    const catalog = buildEndpointCatalog(requests, responses);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.hitCount).toBe(2);
    expect(catalog[0]?.lastStatus).toBe(200);
    expect(catalog[0]?.id).toBe("GET www.aula.dk/api/v17/messages");
  });

  test("redacts sensitive JSON-like text fields", () => {
    const source = '{"token":"abc","name":"ok","session":"123"}';
    const result = redactText(source);
    expect(result).toContain('"token":"[REDACTED]"');
    expect(result).toContain('"session":"[REDACTED]"');
    expect(result).toContain('"name":"ok"');
  });
});
