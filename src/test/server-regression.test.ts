import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createExampleAgents } from "../fixtures/agents.js";

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

function createDispatcher(options?: { requireTenant?: boolean }) {
  const handler = (async () => {
    const { createMapHandler } = await import("../server/index.js");
    return createMapHandler({
      agents: createExampleAgents(),
      ...(options ?? {}),
    });
  })();

  return async function dispatch(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const listener = await handler;
    const req = makeRequest(method, url, body, headers);
    const res = new MockResponse();
    await listener(req as never, res as never);
    const parsedBody =
      res.body && res.body.trim().length > 0 ? JSON.parse(res.body) : {};
    return {
      statusCode: res.statusCode,
      body: parsedBody,
      headers: res.headers,
    };
  };
}

// ── Server Regression Tests ────────────────────────────────────────────────

test("server: /dispatch with missing tenant in strict mode returns 400 policy_denied", async () => {
  const dispatch = createDispatcher({ requireTenant: true });

  const response = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_strict_tenant_missing",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Missing tenant test",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(response.statusCode, 400, "missing tenant in strict mode must reject");
  assert.equal(response.body.error?.code, "policy_denied");
});

test("server: /dispatch with valid tenant in strict mode succeeds", async () => {
  const dispatch = createDispatcher({ requireTenant: true });

  const response = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_strict_tenant_ok",
      requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_a" },
      target_agent: "dbread-agent-v1",
      intent: "Valid tenant test",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(response.statusCode, 200, "valid tenant in strict mode must be accepted");
});

test("server: /approve with missing tenant in strict mode returns 400 policy_denied", async () => {
  const dispatch = createDispatcher({ requireTenant: true });

  const response = await dispatch("POST", "/approve", {
    task_id: "task_approve_strict_tenant_missing",
    approval_reference: "approval:nonexistent",
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_approve_strict_tenant_missing",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Approve missing tenant test",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(response.statusCode, 400, "missing tenant on /approve in strict mode must reject");
  assert.equal(response.body.error?.code, "policy_denied");
});

test("server: /dispatch approval flow — dispatch returns 202, approve returns 200, final status completed", async () => {
  const dispatch = createDispatcher();

  const paused = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_http_approval_chain",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic",
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments",
        },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(paused.statusCode, 202, "approval-gated dispatch must return 202");
  assert.equal(paused.body.result?.status, "awaiting_approval");

  const approvalRef = paused.body.result?.structured_output?.approval_reference;

  const resumed = await dispatch("POST", "/approve", {
    task_id: "task_http_approval_chain",
    approval_reference: approvalRef,
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_http_approval_chain",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic",
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments",
        },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(resumed.statusCode, 200, "approval resume must return 200");
  assert.equal(resumed.body.result?.status, "completed", "approved task must complete");
});

test("server: /approve without pending approval returns 400 task_not_found", async () => {
  const dispatch = createDispatcher();

  const response = await dispatch("POST", "/approve", {
    task_id: "task_orphan_approve",
    approval_reference: "approval:nonexistent",
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_orphan_approve",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Orphan approve test",
      constraints: {
        common: { environment: "production", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error?.code, "task_not_found");
});

test("server: dispatch response includes request_id from x-map-request-id header", async () => {
  const dispatch = createDispatcher();

  const response = await dispatch(
    "POST",
    "/dispatch",
    {
      capability: "db.read.query",
      envelope: {
        task_id: "task_req_id_header_test",
        requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_a" },
        target_agent: "dbread-agent-v1",
        intent: "Request ID header test",
        constraints: {
          common: { environment: "staging", redaction_level: "basic" },
          domain: { dataset: "incident_metrics", service: "payments" },
        },
        risk_class: "medium",
        delegation_token: "placeholder",
        requested_output_mode: "summary",
      },
    },
    { "x-map-request-id": "req-reg-test-456" },
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.request_id, "req-reg-test-456", "request_id must be echoed back");
  assert.equal(response.body.receipt?.request_id, "req-reg-test-456", "receipt must have request_id");
});