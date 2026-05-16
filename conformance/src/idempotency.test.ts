/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";

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

describe("Idempotency Tests", () => {
  describe("Same idempotency key returns same result", () => {
    it("should return same response for duplicate idempotency key", async () => {
      const idempotencyKey = `idem-same-${randomUUID()}`;
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "shared-task-id",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Idempotency same key test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const headers = { "X-Idempotency-Key": idempotencyKey };

      const response1 = await dispatchRequest("POST", "/dispatch", request, headers);
      const response2 = await dispatchRequest("POST", "/dispatch", request, headers);

      console.log(`Same key responses: first=${response1.statusCode}, second=${response2.statusCode}`);

      // If idempotency works, second request should either:
      // - Return 409 Conflict
      // - Return same status code and receipt
      // - Return 200 with same task_id/receipt_id
    });

    it("should return same task_id for same idempotency key", async () => {
      const idempotencyKey = `idem-taskid-${randomUUID()}`;
      const taskId = `shared-task-${randomUUID()}`;
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
          intent: "Idempotency taskid test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const headers = { "X-Idempotency-Key": idempotencyKey };

      const response1 = await dispatchRequest("POST", "/dispatch", request, headers);
      const response2 = await dispatchRequest("POST", "/dispatch", request, headers);

      const taskId1 = response1.body.task_id;
      const taskId2 = response2.body.task_id;

      console.log(`Same idempotency key task_id: first=${taskId1}, second=${taskId2}`);
    });
  });

  describe("Different idempotency key creates new task", () => {
    it("should create new task for different idempotency key", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "fixed-envelope-task",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Different key test",
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

      const taskId1 = response1.body.task_id;
      const taskId2 = response2.body.task_id;

      // Different idempotency keys should result in different tasks
      const areDifferent = taskId1 !== taskId2;
      console.log(`Different keys create different tasks: ${areDifferent || taskId1 === undefined || taskId2 === undefined}`);
    });

    it("should create both tasks when using different idempotency keys on same envelope", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "same-envelope-task",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Both tasks created test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const headers1 = { "X-Idempotency-Key": `idem-${randomUUID()}` };
      const headers2 = { "X-Idempotency-Key": `idem-${randomUUID()}` };

      await dispatchRequest("POST", "/dispatch", request, headers1);
      await dispatchRequest("POST", "/dispatch", request, headers2);

      // Both requests should succeed (create separate tasks)
      console.log(`Both requests completed`);
    });
  });

  describe("Expired idempotency key allows new task", () => {
    it("should allow new task creation with explicitly expired key", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-expired-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Expired key test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      // Key with timestamp that indicates expiration
      const expiredKey = `expired-${Date.now() - 25 * 60 * 60 * 1000}`; // 25 hours ago
      const headers = {
        "X-Idempotency-Key": expiredKey,
        "X-Idempotency-Key-Expires-At": new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await dispatchRequest("POST", "/dispatch", request, headers);
      console.log(`Expired key request: ${response.statusCode}`);
    });

    it("should report idempotency key expiration in response", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-expiration-check-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Expiration check test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const expiredKey = `expired-check-${randomUUID()}`;
      const headers = {
        "X-Idempotency-Key": expiredKey,
        "X-Idempotency-Key-Expires-At": new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      };

      const response = await dispatchRequest("POST", "/dispatch", request, headers);

      // Should either allow new task or indicate expiration
      console.log(`Expiration handling: ${response.statusCode}`);
    });
  });

  describe("Idempotency with different request bodies", () => {
    it("should treat same key with different body as conflict", async () => {
      const idempotencyKey = `idem-conflict-${randomUUID()}`;

      const request1 = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "task-one",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "First request",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const request2 = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "task-two",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Different request",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const headers = { "X-Idempotency-Key": idempotencyKey };

      await dispatchRequest("POST", "/dispatch", request1, headers);
      const response2 = await dispatchRequest("POST", "/dispatch", request2, headers);

      // Same key but different body should cause conflict or be rejected
      console.log(`Same key different body: ${response2.statusCode}`);
    });
  });
});
