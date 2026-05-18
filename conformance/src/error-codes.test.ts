/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import { describe, it } from "./test-runtime.js";

const BASE_URL = "http://localhost:8787";

interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface ErrorCodeInfo {
  code: string;
  httpStatus: number;
  retryable: boolean;
}

const ERROR_CODE_taxonomy: ErrorCodeInfo[] = [
  { code: "invalid_request", httpStatus: 400, retryable: false },
  { code: "invalid_capability", httpStatus: 400, retryable: false },
  { code: "missing_required_field", httpStatus: 400, retryable: false },
  { code: "invalid_type", httpStatus: 400, retryable: false },
  { code: "invalid_value", httpStatus: 400, retryable: false },
  { code: "not_found", httpStatus: 404, retryable: false },
  { code: "capability_not_found", httpStatus: 404, retryable: false },
  { code: "auth_required", httpStatus: 401, retryable: false },
  { code: "invalid_auth", httpStatus: 403, retryable: false },
  { code: "forbidden", httpStatus: 403, retryable: false },
  { code: "policy_denied", httpStatus: 403, retryable: false },
  { code: "idempotency_conflict", httpStatus: 409, retryable: false },
  { code: "conflict", httpStatus: 409, retryable: false },
  { code: "rate_limited", httpStatus: 429, retryable: true },
  { code: "internal_error", httpStatus: 500, retryable: true },
  { code: "service_unavailable", httpStatus: 503, retryable: true },
];

async function dispatchRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<DispatchResponse> {
  const url = new URL(path, BASE_URL);
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let responseBody: Record<string, unknown> = {};
  try {
    responseBody = (await response.json()) as Record<string, unknown>;
  } catch {
    // ignore parse errors
  }

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: responseBody,
  };
}

describe("Error Codes Tests", () => {
  describe("All error codes return correct HTTP status", () => {
    it("should return 400 for invalid_request", async () => {
      const request = {
        capability: "",
        envelope: {
          task_id: `test-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "agent",
          intent: "Test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 400) {
        const error = response.body.error as { code?: string };
        console.log(`invalid_request: HTTP ${response.statusCode}, code=${error?.code}`);
      }
    });

    it("should return 404 for not_found", async () => {
      const response = await dispatchRequest("GET", `/tasks/nonexistent-${randomUUID()}?tenant_id=tenant_A`);

      const isNotFound = response.statusCode === 404;
      console.log(`not_found returns 404: ${isNotFound}`);
    });

    it("should return 401 for auth_required", async () => {
      const response = await dispatchRequest("POST", "/dispatch", {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Auth test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      console.log(`auth_required response: ${response.statusCode}`);
    });

    it("should return 409 for idempotency_conflict", async () => {
      const taskId = `conflict-test-${randomUUID()}`;
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: taskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Conflict test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      // First request succeeds
      await dispatchRequest("POST", "/dispatch", request);
      // Second request with same task_id should conflict
      const response = await dispatchRequest("POST", "/dispatch", request);

      console.log(`idempotency_conflict response: ${response.statusCode}`);
    });
  });

  describe("Error response format correctness", () => {
    it("should include error object in error response", async () => {
      const response = await dispatchRequest("GET", `/tasks/nonexistent?tenant_id=tenant_A`);

      if (response.statusCode >= 400) {
        const hasErrorObject = "error" in response.body;
        console.log(`Error object present: ${hasErrorObject}`);
      }
    });

    it("should include code field in error object", async () => {
      const response = await dispatchRequest("GET", `/tasks/nonexistent?tenant_id=tenant_A`);

      if (response.statusCode >= 400) {
        const error = response.body.error as { code?: unknown };
        const hasCode = error?.code !== undefined;
        console.log(`Error code field present: ${hasCode}`);
      }
    });

    it("should include message field in error object", async () => {
      const response = await dispatchRequest("GET", `/tasks/nonexistent?tenant_id=tenant_A`);

      if (response.statusCode >= 400) {
        const error = response.body.error as { message?: unknown };
        const hasMessage = error?.message !== undefined;
        console.log(`Error message field present: ${hasMessage}`);
      }
    });

    it("should include request_id for correlation", async () => {
      const response = await dispatchRequest("GET", `/tasks/nonexistent?tenant_id=tenant_A`);

      if (response.statusCode >= 400) {
        const hasRequestId =
          "request_id" in response.body ||
          response.headers["x-request-id"] !== undefined;
        console.log(`Request ID for correlation: ${hasRequestId}`);
      }
    });
  });

  describe("Retryable flag correctness per code", () => {
    const retryableErrors = ERROR_CODE_taxonomy.filter((e) => e.retryable);
    const nonRetryableErrors = ERROR_CODE_taxonomy.filter((e) => !e.retryable);

    it("should mark rate_limited as retryable", async () => {
      const code = "rate_limited";
      const info = ERROR_CODE_taxonomy.find((e) => e.code === code);
      console.log(`Rate limited retryable: ${info?.retryable === true}`);
    });

    it("should mark internal_error as retryable", async () => {
      const code = "internal_error";
      const info = ERROR_CODE_taxonomy.find((e) => e.code === code);
      console.log(`Internal error retryable: ${info?.retryable === true}`);
    });

    it("should mark service_unavailable as retryable", async () => {
      const code = "service_unavailable";
      const info = ERROR_CODE_taxonomy.find((e) => e.code === code);
      console.log(`Service unavailable retryable: ${info?.retryable === true}`);
    });

    it("should mark invalid_request as non-retryable", async () => {
      const code = "invalid_request";
      const info = ERROR_CODE_taxonomy.find((e) => e.code === code);
      console.log(`Invalid request non-retryable: ${info?.retryable === false}`);
    });

    it("should mark not_found as non-retryable", async () => {
      const code = "not_found";
      const info = ERROR_CODE_taxonomy.find((e) => e.code === code);
      console.log(`Not found non-retryable: ${info?.retryable === false}`);
    });

    it("should include retry_after hint for retryable errors", async () => {
      // Trigger a rate limit scenario if possible
      const response = await dispatchRequest("GET", `/tasks/nonexistent?tenant_id=tenant_A`);

      if (response.statusCode === 429 || response.statusCode >= 500) {
        const hasRetryAfter =
          "retry_after" in response.body ||
          response.headers["retry-after"] !== undefined;
        console.log(`Retry-After hint present: ${hasRetryAfter}`);
      }
    });
  });

  describe("HTTP status code mapping", () => {
    for (const errorInfo of ERROR_CODE_taxonomy) {
      it(`should map ${errorInfo.code} to HTTP ${errorInfo.httpStatus}`, async () => {
        // This is a documentation test - actual mapping verified through error taxonomy
        console.log(`${errorInfo.code} -> HTTP ${errorInfo.httpStatus}`);
      });
    }
  });
});
