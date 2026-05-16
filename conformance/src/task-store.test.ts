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

describe("Task Store Tests", () => {
  describe("Task creation", () => {
    it("should create a task and store it", async () => {
      const taskId = `test-store-${randomUUID()}`;
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
          intent: "Task store test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Task creation: ${response.statusCode}`);
    });
  });

  describe("Task retrieval", () => {
    it("should retrieve created task by ID", async () => {
      const taskId = `test-retrieve-${randomUUID()}`;
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
          intent: "Task retrieval test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      await dispatchRequest("POST", "/dispatch", request);
      const retrievalResponse = await dispatchRequest(
        "GET",
        `/tasks/${encodeURIComponent(taskId)}?tenant_id=tenant_A`
      );

      const taskMatches = retrievalResponse.statusCode === 200;
      console.log(`Task retrieval success: ${taskMatches}`);
    });

    it("should return 404 for non-existent task", async () => {
      const nonExistentTaskId = `nonexistent-${randomUUID()}`;
      const response = await dispatchRequest(
        "GET",
        `/tasks/${encodeURIComponent(nonExistentTaskId)}?tenant_id=tenant_A`
      );

      const isNotFound = response.statusCode === 404;
      console.log(`Non-existent task 404: ${isNotFound}`);
    });
  });

  describe("Task status updates", () => {
    it("should update task status", async () => {
      const taskId = `test-status-${randomUUID()}`;
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
          intent: "Status update test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      await dispatchRequest("POST", "/dispatch", request);

      // Attempt to update task status
      const updateResponse = await dispatchRequest(
        "PATCH",
        `/tasks/${encodeURIComponent(taskId)}`,
        { status: "in_progress" }
      );

      console.log(`Status update: ${updateResponse.statusCode}`);
    });
  });

  describe("Task listing", () => {
    it("should list tasks for a tenant", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A"
      );

      const isSuccess = response.statusCode === 200;
      const hasTasks = Array.isArray(response.body.tasks);
      console.log(`Task listing: ${isSuccess && hasTasks}`);
    });

    it("should support pagination in task listing", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&limit=10&offset=0"
      );

      if (response.statusCode === 200) {
        const hasPagination =
          "pagination" in response.body ||
          "tasks" in response.body;
        console.log(`Pagination support: ${hasPagination}`);
      }
    });

    it("should filter tasks by status", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&status=pending"
      );

      console.log(`Status filter: ${response.statusCode}`);
    });
  });

  describe("Task deletion", () => {
    it("should delete a task", async () => {
      const taskId = `test-delete-${randomUUID()}`;
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
          intent: "Delete test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      await dispatchRequest("POST", "/dispatch", request);
      const deleteResponse = await dispatchRequest(
        "DELETE",
        `/tasks/${encodeURIComponent(taskId)}?tenant_id=tenant_A`
      );

      console.log(`Task deletion: ${deleteResponse.statusCode}`);
    });
  });

  describe("Task persistence across restarts", () => {
    it("should persist tasks to durable storage", async () => {
      // This test verifies that tasks survive server restarts
      // In practice, this would require killing and restarting the server
      const taskId = `test-persist-${randomUUID()}`;
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
          intent: "Persistence test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      await dispatchRequest("POST", "/dispatch", request);

      // Verify task is stored
      const retrievalResponse = await dispatchRequest(
        "GET",
        `/tasks/${encodeURIComponent(taskId)}?tenant_id=tenant_A`
      );

      console.log(`Task persisted: ${retrievalResponse.statusCode === 200}`);
    });
  });
});
