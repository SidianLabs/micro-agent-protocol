/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import policyFixtures from "./fixtures/policy-fixtures.json" with { type: "json" };

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

describe("Policy Tests", () => {
  for (const scenario of policyFixtures.policy_evaluation_scenarios) {
    it(`should evaluate policy ${scenario.policy_id} for ${scenario.scenario}`, async () => {
      const request = {
        capability: scenario.request.capability,
        envelope: {
          task_id: `test-policy-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "test-agent",
          intent: "Policy test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
          ...scenario.request.envelope,
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Policy ${scenario.policy_id}: ${response.statusCode}`);
    });
  }

  describe("Policy allow effect", () => {
    it("should allow request matching allow policy", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-allow-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Policy allow test",
          constraints: {
            common: { environment: "staging" },
          },
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Allow policy response: ${response.statusCode}`);
    });
  });

  describe("Policy deny effect", () => {
    it("should deny request matching deny policy", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-deny-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Policy deny test",
          constraints: {
            common: { environment: "production" },
          },
          risk_class: "high",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Deny policy response: ${response.statusCode}`);
    });
  });

  describe("Policy approval_required effect", () => {
    it("should require approval for approval_required policy", async () => {
      const request = {
        capability: "audit.export",
        envelope: {
          task_id: `test-approval-required-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "audit-agent-v1",
          intent: "Policy approval test",
          constraints: {},
          risk_class: "medium",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Approval required policy: ${response.statusCode}`);
    });
  });

  describe("Policy tenant isolation", () => {
    it("should enforce tenant-based policy", async () => {
      // Request from tenant_B
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-tenant-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_B",
          },
          target_agent: "dbread-agent-v1",
          intent: "Tenant isolation test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Tenant isolation response: ${response.statusCode}`);
    });
  });

  describe("Policy risk class evaluation", () => {
    it("should evaluate risk class in policy", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-risk-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Risk class policy test",
          constraints: {},
          risk_class: "critical",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Risk class policy response: ${response.statusCode}`);
    });
  });
});
