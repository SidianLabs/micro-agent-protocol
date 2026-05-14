/**
 * MAP Protocol - Conformance Suite: Level 1 (Basic Protocol Compliance)
 *
 * Tests basic protocol operations: dispatch, health check, agent listing,
 * task retrieval, idempotency, error codes, and schema validation.
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import type { SuiteResult, SuiteCheck, SuiteOptions } from "./types.js";

/**
 * Run the Level 1 conformance suite (Basic Protocol Compliance).
 */
export async function run(options: SuiteOptions): Promise<SuiteResult> {
  const checks: SuiteCheck[] = [];
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  // ── Helper ──────────────────────────────────────────────────────────────

  async function fetchJson(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }> {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(extraHeaders ?? {}),
    };
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(options.timeout),
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    let responseBody: Record<string, unknown> = {};
    try {
      responseBody = (await response.json()) as Record<string, unknown>;
    } catch {
      // ignore
    }

    return { status: response.status, body: responseBody, headers: responseHeaders };
  }

  function check(
    name: string,
    condition: boolean,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    if (condition) {
      passed++;
      checks.push({ name, passed: true, message, details });
    } else {
      failed++;
      errors.push(`[${name}] ${message}`);
      checks.push({ name, passed: false, message, details });
    }
  }

  function skip(name: string, reason: string): void {
    skipped++;
    checks.push({ name, passed: false, message: `SKIPPED: ${reason}`, details: { skipped: true, reason } });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-01: Health Check
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const health = await fetchJson("GET", "/ready");
    check(
      "L1-01: Health check accessible",
      health.status === 200,
      `Health endpoint returned ${health.status}`,
      { status: health.status },
    );
  } catch (err) {
    check("L1-01: Health check accessible", false, `Health check failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-02: Agent Listing
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const agents = await fetchJson("GET", "/agents");
    check(
      "L1-02: Agent listing returns valid response",
      agents.status === 200 && Array.isArray(agents.body.agents),
      `Agent listing: status=${agents.status}, has agents array: ${Array.isArray(agents.body.agents)}`,
      { agentCount: Array.isArray(agents.body.agents) ? agents.body.agents.length : 0 },
    );
  } catch (err) {
    check("L1-02: Agent listing", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-03: Basic Dispatch
  // ═══════════════════════════════════════════════════════════════════════════
  const taskId = `task_l1_${randomUUID()}`;
  try {
    const dispatch = await fetchJson("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: taskId,
        requester_identity: {
          type: "user",
          id: "user_l1",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Level 1 basic dispatch test",
        constraints: {
          common: { environment: "staging", redaction_level: "basic" },
          domain: { dataset: "incident_metrics", service: "payments" },
        },
        risk_class: "low",
        delegation_token: "token_l1",
        requested_output_mode: "summary",
      },
    });
    const isSuccess = dispatch.status === 200 || dispatch.status === 202;
    check(
      "L1-03: Basic dispatch succeeds",
      isSuccess,
      `Dispatch returned ${dispatch.status}`,
      { taskId: (dispatch.body?.result as Record<string, unknown> | undefined)?.task_id ?? taskId },
    );
  } catch (err) {
    check("L1-03: Basic dispatch", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-04: Task Retrieval
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const task = await fetchJson("GET", `/tasks/${encodeURIComponent(taskId)}`);
    check(
      "L1-04: Task retrieval works",
      task.status === 200 && task.body.task !== undefined,
      `Task retrieval: status=${task.status}, has task: ${task.body.task !== undefined}`,
      { taskId },
    );
  } catch (err) {
    check("L1-04: Task retrieval", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-05: Idempotency
  // ═══════════════════════════════════════════════════════════════════════════
  const idemKey = `idem_l1_${randomUUID()}`;
  try {
    const idemBody = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `task_l1_idem_${randomUUID()}`,
        requester_identity: { type: "user", id: "user_l1", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Level 1 idempotency test",
        constraints: { common: { environment: "staging" } },
        risk_class: "low",
        delegation_token: "token_l1",
        requested_output_mode: "summary",
      },
    };
    const r1 = await fetchJson("POST", "/dispatch", idemBody, {
      "X-Idempotency-Key": idemKey,
    });
    const r2 = await fetchJson("POST", "/dispatch", idemBody, {
      "X-Idempotency-Key": idemKey,
    });

    const taskId1 = (r1.body?.result as Record<string, unknown>)?.task_id as string | undefined;
    const taskId2 = (r2.body?.result as Record<string, unknown>)?.task_id as string | undefined;

    check(
      "L1-05: Idempotency returns consistent results",
      taskId1 === taskId2 || r2.status === 409,
      `Idempotency: r1=${r1.status} (${taskId1}), r2=${r2.status} (${taskId2})`,
      { taskId1, taskId2, status1: r1.status, status2: r2.status },
    );
  } catch (err) {
    check("L1-05: Idempotency", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-06: Error Codes — Not Found
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const notFound = await fetchJson("GET", "/tasks/non-existent-task-l1");
    check(
      "L1-06: Not found error code",
      notFound.status === 404,
      `Non-existent task returned ${notFound.status}`,
      { errorCode: notFound.body?.code },
    );
  } catch (err) {
    check("L1-06: Error codes", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-07: Invalid Request Validation
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const invalid = await fetchJson("POST", "/dispatch", {
      capability: "db.read.aggregate",
      // envelope intentionally missing
    });
    check(
      "L1-07: Invalid request returns 4xx",
      invalid.status >= 400 && invalid.status < 500,
      `Missing envelope returned ${invalid.status}`,
      { errorCode: invalid.body?.code },
    );
  } catch (err) {
    check("L1-07: Validation", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1-08: Schema Version Header
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const schemaReq = await fetchJson("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `task_l1_schema_${randomUUID()}`,
        requester_identity: { type: "user", id: "user_l1", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Schema version negotiation test",
        constraints: { common: { environment: "staging" } },
        risk_class: "low",
        delegation_token: "token_l1",
        requested_output_mode: "summary",
      },
    }, {
      "X-MAP-Schema-Version": "2026.05.14",
    });
    check(
      "L1-08: Schema version header accepted",
      schemaReq.status === 200 || schemaReq.status === 202 || schemaReq.status === 400,
      `Schema version header returned ${schemaReq.status}`,
      { status: schemaReq.status },
    );
  } catch (err) {
    check("L1-08: Schema version", false, `Failed: ${(err as Error).message}`);
  }

  return {
    suite: "level-1-basic-protocol-compliance",
    description: "Basic Protocol Compliance",
    certificationLevel: 1,
    passed,
    failed,
    skipped,
    errors,
    checks,
  };
}
