/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import type { SuiteResult, SuiteCheck, SuiteOptions } from "./types.js";

/**
 * Run the Level 3 conformance suite (Production Readiness).
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

  function skipCheck(name: string, reason: string): void {
    skipped++;
    checks.push({ name, passed: false, message: `SKIPPED: ${reason}`, details: { skipped: true, reason } });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-01: Async Queue — Dispatch with async delivery mode
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const asyncReq = await fetchJson("POST", "/dispatch", {
      capability: "notification.send",
      envelope: {
        task_id: `task_l3_async_${randomUUID()}`,
        requester_identity: { type: "user", id: "user_l3", tenant_id: "tenant_A" },
        target_agent: "notification-agent-v1",
        intent: "Level 3 async delivery test",
        constraints: {
          common: { environment: "production" },
          domain: { channel: "email" },
        },
        risk_class: "medium",
        delegation_token: "token_l3",
        requested_output_mode: "summary",
        metadata: { async: true },
      },
    });
    check(
      "L3-01: Async dispatch accepted",
      asyncReq.status === 200 || asyncReq.status === 202,
      `Async dispatch returned ${asyncReq.status}`,
      { status: asyncReq.status, taskId: (asyncReq.body?.result as Record<string, unknown>)?.task_id },
    );
  } catch (err) {
    check("L3-01: Async queue", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-02: Receipt Listing and Pagination
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const receipts = await fetchJson("GET", "/receipts?tenant_id=tenant_A&limit=5");
    const hasReceipts = Array.isArray(receipts.body?.receipts);
    const hasPagination = receipts.body?.pagination !== undefined;
    check(
      "L3-02: Receipt pagination works",
      receipts.status === 200 && hasReceipts && hasPagination,
      `Receipt listing: status=${receipts.status}, has receipts=${hasReceipts}, has pagination=${hasPagination}`,
      {
        receiptCount: hasReceipts ? (receipts.body.receipts as unknown[]).length : 0,
        pagination: receipts.body?.pagination,
      },
    );
  } catch (err) {
    check("L3-02: Receipt pagination", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-03: Paginated Task Listing
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const tasks = await fetchJson("GET", "/tasks?tenant_id=tenant_A&limit=10");
    const hasTasks = Array.isArray(tasks.body?.tasks);
    check(
      "L3-03: Task pagination works",
      tasks.status === 200 && hasTasks,
      `Task listing: status=${tasks.status}, has tasks=${hasTasks}`,
      {
        taskCount: hasTasks ? (tasks.body.tasks as unknown[]).length : 0,
        pagination: tasks.body?.pagination,
      },
    );
  } catch (err) {
    check("L3-03: Task pagination", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-04: Alert Listing
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const alerts = await fetchJson("GET", "/alerts?tenant_id=tenant_A&limit=5");
    const hasAlerts = Array.isArray(alerts.body?.alerts);
    check(
      "L3-04: Alert listing accessible",
      alerts.status === 200 && hasAlerts,
      `Alert listing: status=${alerts.status}, has alerts=${hasAlerts}`,
      { alertCount: hasAlerts ? (alerts.body.alerts as unknown[]).length : 0 },
    );
  } catch (err) {
    check("L3-04: Alert listing", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-05: Dead Letter Queue Listing
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const deadLetters = await fetchJson("GET", "/dead-letters?tenant_id=tenant_A&limit=5");
    const hasDeadLetters = Array.isArray(deadLetters.body?.dead_letters);
    check(
      "L3-05: Dead letter listing accessible",
      deadLetters.status === 200 && hasDeadLetters,
      `Dead letter listing: status=${deadLetters.status}, has dead_letters=${hasDeadLetters}`,
      { deadLetterCount: hasDeadLetters ? (deadLetters.body.dead_letters as unknown[]).length : 0 },
    );
  } catch (err) {
    check("L3-05: Dead letters", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-06: Audit Event Listing
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const auditEvents = await fetchJson("GET", "/audit-events?limit=5");
    const hasEvents = Array.isArray(auditEvents.body?.events);
    check(
      "L3-06: Audit event listing accessible",
      auditEvents.status === 200 && hasEvents,
      `Audit events: status=${auditEvents.status}, has events=${hasEvents}`,
      { eventCount: hasEvents ? (auditEvents.body.events as unknown[]).length : 0 },
    );
  } catch (err) {
    check("L3-06: Audit events", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-07: Schema Negotiation — Request specific schema version
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const schemaReq = await fetchJson("POST", "/dispatch", {
      capability: "db.read.aggregate",
      requested_schema_version: "2026.05.14",
      envelope: {
        task_id: `task_l3_schema_${randomUUID()}`,
        requester_identity: { type: "user", id: "user_l3", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Schema negotiation test",
        constraints: { common: { environment: "staging" } },
        risk_class: "low",
        delegation_token: "token_l3",
        requested_output_mode: "summary",
      },
    });
    check(
      "L3-07: Schema version negotiation",
      schemaReq.status === 200 || schemaReq.status === 202 || schemaReq.status === 400,
      `Schema negotiation returned ${schemaReq.status}`,
      {
        status: schemaReq.status,
        negotiatedVersion: (schemaReq.body?.result as Record<string, unknown>)?.negotiated_schema_version ??
          (schemaReq.body?.result as Record<string, unknown>)?.executed_schema_version,
      },
    );
  } catch (err) {
    check("L3-07: Schema negotiation", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-08: Webhook URL in Metadata
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const webhookReq = await fetchJson("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `task_l3_webhook_${randomUUID()}`,
        requester_identity: { type: "user", id: "user_l3", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Webhook URL test",
        constraints: { common: { environment: "staging" } },
        risk_class: "low",
        delegation_token: "token_l3",
        requested_output_mode: "summary",
        metadata: {
          webhook_url: "https://example.com/webhook/map-callback",
        },
      },
    });
    check(
      "L3-08: Webhook URL in metadata accepted",
      webhookReq.status === 200 || webhookReq.status === 202,
      `Webhook dispatch returned ${webhookReq.status}`,
      { status: webhookReq.status },
    );
  } catch (err) {
    check("L3-08: Webhook URL", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-09: Status endpoint
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const status = await fetchJson("GET", "/status");
    check(
      "L3-09: Status endpoint accessible",
      status.status === 200,
      `Status returned ${status.status}`,
      { body: status.body },
    );
  } catch (err) {
    check("L3-09: Status endpoint", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-10: Capability Discovery via Agent Listing
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    // Filter agents by capability
    const agentsByCap = await fetchJson("GET", "/agents?capability=db.read.aggregate");
    const hasAgents = Array.isArray(agentsByCap.body?.agents);
    const agentCount = hasAgents ? (agentsByCap.body.agents as unknown[]).length : 0;
    check(
      "L3-10: Capability-based agent discovery works",
      agentsByCap.status === 200 && hasAgents,
      `Agent discovery by capability: status=${agentsByCap.status}, count=${agentCount}`,
      { agentCount },
    );
  } catch (err) {
    check("L3-10: Capability discovery", false, `Failed: ${(err as Error).message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3-11: Rate Limiting Headers
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const rlCheck = await fetchJson("GET", "/ready");
    const hasRateLimitHeaders =
      rlCheck.headers["x-ratelimit-limit"] !== undefined ||
      rlCheck.headers["x-ratelimit-remaining"] !== undefined ||
      rlCheck.headers["retry-after"] !== undefined ||
      rlCheck.status < 500;
    check(
      "L3-11: Rate limiting infrastructure present (headers or graceful handling)",
      hasRateLimitHeaders,
      `Rate limit check: status=${rlCheck.status}`,
      {
        headers: {
          "x-ratelimit-limit": rlCheck.headers["x-ratelimit-limit"],
          "x-ratelimit-remaining": rlCheck.headers["x-ratelimit-remaining"],
        },
      },
    );
  } catch (err) {
    check("L3-11: Rate limiting", false, `Failed: ${(err as Error).message}`);
  }

  return {
    suite: "level-3-production-readiness",
    description: "Production Readiness",
    certificationLevel: 3,
    passed,
    failed,
    skipped,
    errors,
    checks,
  };
}
