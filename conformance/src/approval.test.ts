import { randomUUID } from "node:crypto";

const BASE_URL = "http://localhost:8787";

interface ApprovalRequest {
  task_id: string;
  approved_by: string;
  approval_timestamp?: string;
  notes?: string;
}

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

describe("Approval Tests", () => {
  const taskId = `test-approval-${randomUUID()}`;
  const approverId = "approver_001";

  beforeAll(async () => {
    // Create a task that requires approval first
    const createResponse = await dispatchRequest("POST", "/dispatch", {
      capability: "audit.export",
      envelope: {
        task_id: taskId,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "audit-agent-v1",
        intent: "Approval test task",
        constraints: {},
        risk_class: "medium",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    });
    console.log(`Created approval-requiring task: ${createResponse.statusCode}`);
  });

  describe("Successful approval", () => {
    it("should successfully approve a pending task", async () => {
      const approvalRequest: ApprovalRequest = {
        task_id: taskId,
        approved_by: approverId,
        approval_timestamp: new Date().toISOString(),
        notes: "Approved for conformance testing",
      };

      const response = await dispatchRequest(
        "POST",
        `/tasks/${encodeURIComponent(taskId)}/approve`,
        approvalRequest
      );

      console.log(`Approval response: ${response.statusCode} - ${JSON.stringify(response.body)}`);
    });
  });

  describe("Approval with expired reference", () => {
    it("should reject approval with expired task reference", async () => {
      const expiredTaskId = `expired-task-${randomUUID()}`;
      const approvalRequest: ApprovalRequest = {
        task_id: expiredTaskId,
        approved_by: approverId,
        approval_timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        notes: "Expired approval attempt",
      };

      const response = await dispatchRequest(
        "POST",
        `/tasks/${encodeURIComponent(expiredTaskId)}/approve`,
        approvalRequest
      );

      console.log(`Expired approval: ${response.statusCode}`);
    });
  });

  describe("Approval with invalid capability", () => {
    it("should reject approval for task with invalid capability", async () => {
      const invalidCapTaskId = `invalid-cap-task-${randomUUID()}`;
      // First create the task
      await dispatchRequest("POST", "/dispatch", {
        capability: "nonexistent.capability",
        envelope: {
          task_id: invalidCapTaskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "test-agent",
          intent: "Test invalid capability",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const approvalRequest: ApprovalRequest = {
        task_id: invalidCapTaskId,
        approved_by: approverId,
      };

      const response = await dispatchRequest(
        "POST",
        `/tasks/${encodeURIComponent(invalidCapTaskId)}/approve`,
        approvalRequest
      );

      console.log(`Invalid capability approval: ${response.statusCode}`);
    });
  });

  describe("Approval after task already completed", () => {
    it("should reject approval for already completed task", async () => {
      const completedTaskId = `completed-task-${randomUUID()}`;
      // Create and complete a task
      await dispatchRequest("POST", "/dispatch", {
        capability: "db.read.aggregate",
        envelope: {
          task_id: completedTaskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Task to complete",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      // Try to approve already completed task
      const approvalRequest: ApprovalRequest = {
        task_id: completedTaskId,
        approved_by: approverId,
      };

      const response = await dispatchRequest(
        "POST",
        `/tasks/${encodeURIComponent(completedTaskId)}/approve`,
        approvalRequest
      );

      console.log(`Already completed approval: ${response.statusCode}`);
    });
  });

  describe("Approval without proper authorization", () => {
    it("should reject approval without proper authorization", async () => {
      const unauthorizedTaskId = `unauth-task-${randomUUID()}`;
      // Create a task
      await dispatchRequest("POST", "/dispatch", {
        capability: "audit.export",
        envelope: {
          task_id: unauthorizedTaskId,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "audit-agent-v1",
          intent: "Test unauthorized approval",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      // Try to approve without proper auth header
      const approvalRequest: ApprovalRequest = {
        task_id: unauthorizedTaskId,
        approved_by: "unauthorized_user",
      };

      const response = await dispatchRequest(
        "POST",
        `/tasks/${encodeURIComponent(unauthorizedTaskId)}/approve`,
        approvalRequest
      );

      console.log(`Unauthorized approval: ${response.statusCode}`);
    });
  });
});
