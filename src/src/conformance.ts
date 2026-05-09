import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createMapHandler } from "./server.js";
import { signHttpRequest } from "./security/signing.js";

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
  headers: Record<string, string> = {}
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
  const handler = createMapHandler({ ...options, includeExampleAgents: true });
  return async (
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<DispatchResponse> => {
    const req = makeRequest(method, url, body, headers);
    const res = new MockResponse();
    await handler(req as never, res as never);
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {}
    };
  };
}

interface ConformanceCheck {
  name: string;
  ok: boolean;
  details?: string;
}

async function run(): Promise<void> {
  const checks: ConformanceCheck[] = [];
  const dispatch = createDispatcher({
    deploymentProfile: "verified",
    enforceSignedRequests: true,
    requireTenant: true
  });

  const ready = await dispatch("GET", "/ready");
  checks.push({
    name: "ready_endpoint_available",
    ok: ready.statusCode === 503 || ready.statusCode === 200
  });

  const unsigned = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: `task_conf_unsigned_${randomUUID()}`,
      requester_identity: { type: "user", id: "conformance_user", tenant_id: "tenant_A" },
      target_agent: "dbread-agent-v1",
      intent: "Unsigned request should be rejected in verified mode",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  checks.push({
    name: "signed_request_required",
    ok: unsigned.statusCode === 401 || unsigned.statusCode === 403
  });

  const signedBody = {
    capability: "db.read.aggregate",
    envelope: {
      task_id: `task_conf_signed_${randomUUID()}`,
      requester_identity: { type: "user", id: "conformance_user", tenant_id: "tenant_A" },
      target_agent: "dbread-agent-v1",
      intent: "Signed request should succeed",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };
  const rawBody = JSON.stringify(signedBody);
  const signedHeaders = signHttpRequest({
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "map-dev-key-1",
    body: rawBody
  });
  const signed = await dispatch("POST", "/dispatch", signedBody, { ...signedHeaders });
  checks.push({
    name: "signed_dispatch_succeeds",
    ok: signed.statusCode === 200 || signed.statusCode === 202
  });

  const receiptId = String((signed.body.receipt as { receipt_id?: string } | undefined)?.receipt_id ?? "");
  const receiptLookup = receiptId
    ? await dispatch("GET", `/receipts/${encodeURIComponent(receiptId)}?tenant_id=tenant_A`)
    : undefined;
  checks.push({
    name: "receipt_partition_lookup",
    ok: Boolean(receiptLookup && receiptLookup.statusCode === 200)
  });

  const blockedCrossTenant = await dispatch("GET", "/tasks?tenant_id=tenant_B");
  checks.push({
    name: "tenant_partition_query_supported",
    ok: blockedCrossTenant.statusCode === 200
  });

  const pagedTasks = await dispatch("GET", "/tasks?tenant_id=tenant_A&limit=1");
  checks.push({
    name: "tasks_pagination_contract",
    ok:
      pagedTasks.statusCode === 200 &&
      typeof (pagedTasks.body.pagination as { limit?: unknown } | undefined)?.limit === "number"
  });

  const pagedAudit = await dispatch("GET", "/audit-events?limit=1");
  checks.push({
    name: "audit_pagination_contract",
    ok:
      pagedAudit.statusCode === 200 &&
      typeof (pagedAudit.body.pagination as { next_cursor?: unknown } | undefined)?.next_cursor !==
        "undefined"
  });

  const pagedDeadLetters = await dispatch("GET", "/dead-letters?limit=1");
  checks.push({
    name: "dead_letters_pagination_contract",
    ok:
      pagedDeadLetters.statusCode === 200 &&
      typeof (pagedDeadLetters.body.pagination as { limit?: unknown } | undefined)?.limit === "number"
  });

  const pagedAlerts = await dispatch("GET", "/alerts?limit=1");
  checks.push({
    name: "alerts_pagination_contract",
    ok:
      pagedAlerts.statusCode === 200 &&
      typeof (pagedAlerts.body.pagination as { limit?: unknown } | undefined)?.limit === "number"
  });

  const failed = checks.filter((check) => !check.ok);
  const summary = {
    profile: "verified",
    total_checks: checks.length,
    passed_checks: checks.length - failed.length,
    failed_checks: failed.length,
    checks
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void run();
