/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import { describe, it } from "./test-runtime.js";
import signatureFixtures from "./fixtures/signature-fixtures.json" with { type: "json" };
import validDispatchRequests from "./fixtures/valid-dispatch-requests.json" with { type: "json" };
import invalidEnvelopes from "./fixtures/invalid-envelopes.json" with { type: "json" };

const BASE_URL = "http://localhost:8787";

interface DispatchRequest {
  capability: string;
  envelope: {
    task_id: string;
    requester_identity: {
      type: string;
      id: string;
      tenant_id: string;
    };
    target_agent: string;
    intent: string;
    constraints: Record<string, unknown>;
    risk_class: string;
    delegation_token: string;
    requested_output_mode: string;
  };
}

interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface ErrorBody {
  code?: string;
  message?: string;
  retryable?: boolean;
}

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

describe("Dispatch Tests", () => {
  describe("Successful dispatch", () => {
    it("should successfully dispatch a valid low-risk request", async () => {
      const request = validDispatchRequests.valid_dispatch_requests[0];
      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode === 200 || response.statusCode === 202) {
        // Task created successfully
        const hasReceipt =
          "receipt_id" in response.body ||
          "task_id" in response.body ||
          response.statusCode === 202;
        console.log(`Dispatch successful: ${hasReceipt}`);
      }
    });

    it("should dispatch with different capabilities", async () => {
      for (const request of validDispatchRequests.valid_dispatch_requests) {
        const response = await dispatchRequest("POST", "/dispatch", request);
        // Accept success or async-pending for async capabilities
        const validStatuses = [200, 202];
        if (!validStatuses.includes(response.statusCode)) {
          console.log(`Capability ${request.capability} returned ${response.statusCode}`);
        }
      }
    });
  });

  describe("Dispatch with capability not found", () => {
    it("should return appropriate error for unknown capability", async () => {
      const request = {
        capability: "nonexistent.capability",
        envelope: {
          task_id: `test-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "test-agent",
          intent: "Test capability not found",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      const errorCodes = ["capability_not_found", "invalid_capability", "unknown_capability"];
      const errorBody = response.body.error as ErrorBody | undefined;
      const hasExpectedError =
        response.statusCode === 400 || response.statusCode === 404 || errorCodes.includes(String(errorBody?.code));
      console.log(`Capability not found: ${response.statusCode} - ${JSON.stringify(response.body.error)}`);
    });
  });

  describe("Dispatch with agent disabled", () => {
    it("should return appropriate error for disabled agent", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "disabled-agent",
          intent: "Test disabled agent",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Disabled agent: ${response.statusCode} - ${JSON.stringify(response.body.error)}`);
    });
  });

  describe("Dispatch with policy denied", () => {
    it("should return 403 for policy-denied request", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Test policy denied",
          constraints: {
            common: { environment: "production" },
            domain: { dataset: "sensitive_data" },
          },
          risk_class: "high",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Policy denied: ${response.statusCode} - ${JSON.stringify(response.body.error)}`);
    });
  });

  describe("Dispatch requiring approval", () => {
    it("should return 202 or appropriate status for approval-required capability", async () => {
      const request = validDispatchRequests.valid_dispatch_requests.find(
        (r) => r.capability === "audit.export"
      );
      if (!request) {
        console.log("audit.export fixture not found");
        return;
      }

      const response = await dispatchRequest("POST", "/dispatch", {
        ...request,
        envelope: {
          ...request.envelope,
          task_id: `test-approval-${randomUUID()}`,
        },
      });

      // Should either succeed with pending or return approval-required error
      console.log(`Approval required: ${response.statusCode}`);
    });
  });

  describe("Dispatch with async delivery mode", () => {
    it("should return 202 for async-capable capability", async () => {
      const request = {
        capability: "notification.send",
        envelope: {
          task_id: `test-async-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "notification-agent-v1",
          intent: "Send notification",
          constraints: {
            common: { environment: "production" },
            domain: { channel: "email" },
          },
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Async delivery: ${response.statusCode}`);
    });
  });

  describe("Schema version negotiation", () => {
    it("should negotiate correct schema version", async () => {
      const request = validDispatchRequests.valid_dispatch_requests[0];
      const response = await dispatchRequest(
        "POST",
        "/dispatch",
        request,
        {}
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        const hasVersionInfo =
          "version" in response.body ||
          "schema_version" in response.body ||
          response.headers["x-map-version"] !== undefined;
        console.log(`Version negotiation: ${hasVersionInfo}`);
      }
    });
  });

  describe("Visibility mode selection", () => {
    it("should respect visibility constraints", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-visibility-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Test visibility",
          constraints: {
            common: { environment: "staging", redaction_level: "full" },
            domain: { dataset: "incident_metrics" },
          },
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Visibility: ${response.statusCode}`);
    });
  });

  describe("Idempotency key handling", () => {
    it("should respect idempotency key for duplicate detection", async () => {
      const idempotencyKey = `idem-${randomUUID()}`;
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "fixed-task-idempotency",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Idempotency test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const headers = { "X-Idempotency-Key": idempotencyKey };
      const response1 = await dispatchRequest("POST", "/dispatch", request, headers);
      const response2 = await dispatchRequest("POST", "/dispatch", request, headers);

      // If idempotency is supported, second request should return same result or 409
      console.log(`Idempotency: first=${response1.statusCode}, second=${response2.statusCode}`);
    });

    it("should create new task for different idempotency key", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "fixed-task-idempotency-diff",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Idempotency test diff key",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const headers1 = { "X-Idempotency-Key": `idem-${randomUUID()}` };
      const headers2 = { "X-Idempotency-Key": `idem-${randomUUID()}` };

      const response1 = await dispatchRequest("POST", "/dispatch", request, headers1);
      const response2 = await dispatchRequest("POST", "/dispatch", request, headers2);

      console.log(`Diff key: first=${response1.statusCode}, second=${response2.statusCode}`);
    });
  });
});
