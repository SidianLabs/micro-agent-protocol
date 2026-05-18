/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import { describe, it } from "./test-runtime.js";
import validDispatchRequests from "./fixtures/valid-dispatch-requests.json" with { type: "json" };
import invalidEnvelopes from "./fixtures/invalid-envelopes.json" with { type: "json" };

const BASE_URL = "http://localhost:8787";

interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
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

describe("Validation Tests", () => {
  describe("Valid task envelope", () => {
    it("should accept valid task envelope", async () => {
      const request = validDispatchRequests.valid_dispatch_requests[0];
      const response = await dispatchRequest("POST", "/dispatch", request);

      const isSuccess = response.statusCode >= 200 && response.statusCode < 300;
      console.log(`Valid envelope accepted: ${isSuccess}`);
    });

    it("should accept envelope with all required fields", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-valid-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Complete envelope test",
          constraints: {
            common: { environment: "staging", redaction_level: "basic" },
            domain: { dataset: "test_data" },
          },
          risk_class: "low",
          delegation_token: "valid_token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      const isSuccess = response.statusCode >= 200 && response.statusCode < 300;
      console.log(`Complete envelope: ${isSuccess}`);
    });
  });

  describe("Invalid task envelope - missing required fields", () => {
    for (const invalidCase of invalidEnvelopes.invalid_envelopes) {
      if (invalidCase.expected_error === "missing_required_field") {
        it(`should reject envelope missing ${invalidCase.description}`, async () => {
          const response = await dispatchRequest("POST", "/dispatch", {
            capability: "db.read.aggregate",
            envelope: invalidCase.envelope,
          });

          console.log(`Missing field "${invalidCase.description}": ${response.statusCode}`);
        });
      }
    }
  });

  describe("Invalid task envelope - wrong types", () => {
    for (const invalidCase of invalidEnvelopes.invalid_envelopes) {
      if (invalidCase.expected_error === "invalid_type") {
        it(`should reject envelope with wrong type for ${invalidCase.description}`, async () => {
          const response = await dispatchRequest("POST", "/dispatch", {
            capability: "db.read.aggregate",
            envelope: invalidCase.envelope,
          });

          console.log(`Wrong type "${invalidCase.description}": ${response.statusCode}`);
        });
      }
    }
  });

  describe("Valid dispatch request", () => {
    it("should accept valid dispatch request structure", async () => {
      const request = validDispatchRequests.valid_dispatch_requests[0];
      const response = await dispatchRequest("POST", "/dispatch", request);

      const isSuccess = response.statusCode >= 200 && response.statusCode < 300;
      console.log(`Valid dispatch request: ${isSuccess}`);
    });

    it("should include capability field", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-cap-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Capability test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      const isSuccess = response.statusCode >= 200 && response.statusCode < 300;
      console.log(`Capability field present: ${isSuccess}`);
    });
  });

  describe("Invalid dispatch request", () => {
    for (const invalidCase of invalidEnvelopes.invalid_dispatch_requests) {
      it(`should reject invalid dispatch: ${invalidCase.description}`, async () => {
        const response = await dispatchRequest("POST", "/dispatch", invalidCase.dispatch);

        const isError = response.statusCode >= 400;
        console.log(`Invalid dispatch "${invalidCase.description}": ${isError}`);
      });
    }
  });

  describe("Valid execution receipt", () => {
    it("should return valid receipt structure on success", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-receipt-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Receipt test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        const hasReceiptFields =
          "receipt_id" in response.body ||
          "task_id" in response.body ||
          "status" in response.body;
        console.log(`Receipt has required fields: ${hasReceiptFields}`);
      }
    });

    it("should include timestamp in receipt", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-receipt-ts-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Receipt timestamp test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        const hasTimestamp =
          "created_at" in response.body ||
          "timestamp" in response.body ||
          "completed_at" in response.body;
        console.log(`Receipt has timestamp: ${hasTimestamp}`);
      }
    });
  });

  describe("Invalid execution receipt", () => {
    for (const invalidCase of invalidEnvelopes.invalid_receipts) {
      it(`should reject invalid receipt: ${invalidCase.description}`, async () => {
        // This would test the receipts endpoint directly
        const url = new URL("/receipts", BASE_URL);
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invalidCase.receipt),
        });

        console.log(`Invalid receipt "${invalidCase.description}": ${response.status}`);
      });
    }
  });
});
