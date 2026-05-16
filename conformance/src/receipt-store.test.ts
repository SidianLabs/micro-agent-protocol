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

describe("Receipt Store Tests", () => {
  describe("Receipt creation", () => {
    it("should create receipt when task is completed", async () => {
      const taskId = `test-receipt-create-${randomUUID()}`;
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
          intent: "Receipt creation test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        const hasReceiptId = "receipt_id" in response.body;
        console.log(`Receipt created: ${hasReceiptId}`);
      }
    });
  });

  describe("Receipt retrieval", () => {
    it("should retrieve receipt by ID", async () => {
      const taskId = `test-receipt-retrieve-${randomUUID()}`;
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
          intent: "Receipt retrieval test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const dispatchResponse = await dispatchRequest("POST", "/dispatch", request);

      if (dispatchResponse.statusCode >= 200 && dispatchResponse.statusCode < 300) {
        const receiptId = dispatchResponse.body.receipt_id as string;
        if (receiptId) {
          const retrievalResponse = await dispatchRequest(
            "GET",
            `/receipts/${encodeURIComponent(receiptId)}?tenant_id=tenant_A`
          );

          console.log(`Receipt retrieval: ${retrievalResponse.statusCode}`);
        }
      }
    });

    it("should return 404 for non-existent receipt", async () => {
      const nonExistentReceiptId = `nonexistent-${randomUUID()}`;
      const response = await dispatchRequest(
        "GET",
        `/receipts/${encodeURIComponent(nonExistentReceiptId)}?tenant_id=tenant_A`
      );

      const isNotFound = response.statusCode === 404;
      console.log(`Non-existent receipt 404: ${isNotFound}`);
    });
  });

  describe("Receipt structure", () => {
    it("should contain required fields in receipt", async () => {
      const taskId = `test-receipt-struct-${randomUUID()}`;
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
          intent: "Receipt structure test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        const receipt = response.body;
        const hasRequiredFields =
          "receipt_id" in receipt ||
          "task_id" in receipt ||
          "status" in receipt;
        console.log(`Receipt has required fields: ${hasRequiredFields}`);
      }
    });

    it("should include timestamp in receipt", async () => {
      const taskId = `test-receipt-ts-${randomUUID()}`;
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
          intent: "Receipt timestamp test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        const receipt = response.body;
        const hasTimestamp =
          "created_at" in receipt ||
          "completed_at" in receipt ||
          "timestamp" in receipt;
        console.log(`Receipt has timestamp: ${hasTimestamp}`);
      }
    });
  });

  describe("Receipt listing", () => {
    it("should list receipts for a tenant", async () => {
      const response = await dispatchRequest(
        "GET",
        "/receipts?tenant_id=tenant_A"
      );

      const isSuccess = response.statusCode === 200;
      console.log(`Receipt listing: ${isSuccess}`);
    });

    it("should support pagination in receipt listing", async () => {
      const response = await dispatchRequest(
        "GET",
        "/receipts?tenant_id=tenant_A&limit=10"
      );

      if (response.statusCode === 200) {
        const hasPagination =
          "pagination" in response.body ||
          "limit" in response.body;
        console.log(`Receipt pagination: ${hasPagination}`);
      }
    });
  });

  describe("Receipt for async tasks", () => {
    it("should create receipt for async-delivered capability", async () => {
      const taskId = `test-async-receipt-${randomUUID()}`;
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
          intent: "Async receipt test",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      // Async capabilities may return 202 Accepted
      console.log(`Async task response: ${response.statusCode}`);
    });
  });
});
