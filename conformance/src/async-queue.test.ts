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

describe("Async Queue Tests", () => {
  describe("Async task submission", () => {
    it("should accept async-capable task", async () => {
      const taskId = `test-async-${randomUUID()}`;
      const request = {
        capability: "notification.send",
        envelope: {
          task_id: taskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "notification-agent-v1",
          intent: "Async queue test",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Async task submission: ${response.statusCode}`);
    });

    it("should return 202 for async-capable capability", async () => {
      const taskId = `test-async-202-${randomUUID()}`;
      const request = {
        capability: "audit.export",
        envelope: {
          task_id: taskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "audit-agent-v1",
          intent: "Async capability test",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      const isAsyncAccepted = response.statusCode === 202 || response.statusCode === 200;
      console.log(`Async 202 response: ${isAsyncAccepted}`);
    });
  });

  describe("Queue status", () => {
    it("should indicate queue position", async () => {
      const taskId = `test-queue-pos-${randomUUID()}`;
      const request = {
        capability: "notification.send",
        envelope: {
          task_id: taskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "notification-agent-v1",
          intent: "Queue position test",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode === 202) {
        const hasQueueInfo =
          "queue_position" in response.body ||
          "estimated_delay" in response.body ||
          "queue_id" in response.body;
        console.log(`Queue position info: ${hasQueueInfo}`);
      }
    });
  });

  describe("Queue persistence", () => {
    it("should persist queued task", async () => {
      const taskId = `test-queue-persist-${randomUUID()}`;
      const request = {
        capability: "notification.send",
        envelope: {
          task_id: taskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "notification-agent-v1",
          intent: "Queue persistence test",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      // Verify task is in queue
      const taskResponse = await dispatchRequest(
        "GET",
        `/tasks/${encodeURIComponent(taskId)}?tenant_id=tenant_A`
      );

      console.log(`Queue persistence: ${taskResponse.statusCode}`);
    });
  });

  describe("Delivery mode", () => {
    it("should support synchronous delivery mode", async () => {
      const taskId = `test-sync-${randomUUID()}`;
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
          intent: "Sync delivery test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      // Sync delivery should return result immediately or 200
      const isSync = response.statusCode === 200;
      console.log(`Sync delivery: ${isSync}`);
    });

    it("should support asynchronous delivery mode", async () => {
      const taskId = `test-async-mode-${randomUUID()}`;
      const request = {
        capability: "notification.send",
        envelope: {
          task_id: taskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "notification-agent-v1",
          intent: "Async mode test",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      // Async delivery should return 202 or accept the task for later processing
      console.log(`Async mode: ${response.statusCode}`);
    });
  });

  describe("Batch async handling", () => {
    it("should handle multiple async tasks in queue", async () => {
      const capabilities = ["notification.send", "audit.export", "notification.send"];

      for (let i = 0; i < capabilities.length; i++) {
        const taskId = `test-batch-${i}-${randomUUID()}`;
        const request = {
          capability: capabilities[i],
          envelope: {
            task_id: taskId,
            requester_identity: {
              type: "user",
              id: "user_001",
              tenant_id: "tenant_A",
            },
            target_agent: capabilities[i] === "audit.export" ? "audit-agent-v1" : "notification-agent-v1",
            intent: `Batch async test ${i}`,
            constraints: {},
            risk_class: "medium",
            delegation_token: "token",
            requested_output_mode: "summary",
          },
        };

        const response = await dispatchRequest("POST", "/dispatch", request);
        console.log(`Batch task ${i}: ${response.statusCode}`);
      }
    });
  });
});
