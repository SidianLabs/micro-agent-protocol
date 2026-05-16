/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createMapHandler } from "./server/index.js";
import { signHttpRequest } from "./security/signing.js";
import { createExampleAgents } from "./fixtures/agents.js";

interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

class MockResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";

  writeHead(statusCode: number, headers: Record<string, string>): this {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }

  end(chunk?: string): this {
    this.body = chunk ?? "";
    return this;
  }
}

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Readable & { method: string; url: string; headers: Record<string, string> } {
  const payload = body === undefined ? [] : [JSON.stringify(body)];
  const req = Readable.from(payload) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function createDispatcher(options?: Parameters<typeof createMapHandler>[0]) {
  const handler = createMapHandler({
    ...options,
    agents: createExampleAgents(),
  });
  return async (
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<DispatchResponse> => {
    const req = makeRequest(method, url, body, headers);
    const res = new MockResponse();
    await handler(req as never, res as never);
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
    };
  };
}

interface ConformanceCheck {
  name: string;
  ok: boolean;
}

function getErrorCode(response: DispatchResponse): string {
  return String(
    (response.body.error as { code?: unknown } | undefined)?.code ??
      "missing_error_code",
  );
}

async function run(): Promise<void> {
  const checks: ConformanceCheck[] = [];

  const openDispatch = createDispatcher();
  const invalidRequest = await openDispatch("POST", "/dispatch", {
    capability: "",
  });
  checks.push({
    name: "error_invalid_request",
    ok:
      invalidRequest.statusCode === 400 &&
      getErrorCode(invalidRequest) === "invalid_request",
  });

  const notFound = await openDispatch("GET", "/definitely-not-a-route");
  checks.push({
    name: "error_not_found",
    ok: notFound.statusCode === 404 && getErrorCode(notFound) === "not_found",
  });

  const signedDispatch = createDispatcher({
    enforceSignedRequests: true,
    requireTenant: true,
  });
  const unsigned = await signedDispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: `task_conf_error_unsigned_${randomUUID()}`,
      requester_identity: {
        type: "user",
        id: "error_user",
        tenant_id: "tenant_A",
      },
      target_agent: "dbread-agent-v1",
      intent: "Unsigned should fail",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });
  checks.push({
    name: "error_auth_required",
    ok:
      unsigned.statusCode === 401 && getErrorCode(unsigned) === "auth_required",
  });

  const validBody = {
    capability: "db.read.aggregate",
    envelope: {
      task_id: `task_conf_error_signed_${randomUUID()}`,
      requester_identity: {
        type: "user",
        id: "error_user",
        tenant_id: "tenant_A",
      },
      target_agent: "dbread-agent-v1",
      intent: "Signed route",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  };
  const tamperedHeaders = signHttpRequest({
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "map-dev-key-1",
    body: JSON.stringify(validBody),
  });
  tamperedHeaders["x-map-request-signature"] =
    `${tamperedHeaders["x-map-request-signature"]}tampered`;
  const invalidAuth = await signedDispatch(
    "POST",
    "/dispatch",
    validBody,
    tamperedHeaders as unknown as Record<string, string>,
  );
  checks.push({
    name: "error_invalid_auth",
    ok:
      invalidAuth.statusCode === 403 &&
      getErrorCode(invalidAuth) === "invalid_auth",
  });

  const conflictDispatch = createDispatcher();
  await conflictDispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_conflict_error_fixed",
      requester_identity: { type: "user", id: "error_user_A" },
      target_agent: "dbread-agent-v1",
      intent: "Conflict seed 1",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });
  const conflict = await conflictDispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_conflict_error_fixed",
      requester_identity: { type: "user", id: "error_user_B" },
      target_agent: "dbread-agent-v1",
      intent: "Conflict seed 2",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });
  checks.push({
    name: "error_conflict",
    ok:
      conflict.statusCode === 409 &&
      getErrorCode(conflict) === "idempotency_conflict",
  });

  const failed = checks.filter((check) => !check.ok);
  const summary = {
    suite: "error_taxonomy",
    total_checks: checks.length,
    passed_checks: checks.length - failed.length,
    failed_checks: failed.length,
    checks,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void run();
