import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createMapHandler } from "../src/server.js";
import {
  MapAssistantClient,
  type MapClientRequest,
  type MapClientTransport
} from "../src/sdk/client.js";

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

class HandlerTransport implements MapClientTransport {
  constructor(private readonly handler: ReturnType<typeof createMapHandler>) {}

  async request<T>(input: {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ status: number; body: T; headers?: Record<string, string> }> {
    const req = makeRequest(input.method, input.path, input.body, input.headers);
    const res = new MockResponse();
    await this.handler(req as never, res as never);
    const parsedBody = res.body && res.body.trim().length > 0 ? (JSON.parse(res.body) as T) : ({} as T);
    return {
      status: res.statusCode,
      body: parsedBody,
      headers: res.headers
    };
  }
}

test("sdk client can discover agents and dispatch", async () => {
  const handler = createMapHandler({ includeExampleAgents: true });
  const client = new MapAssistantClient(new HandlerTransport(handler));

  const agents = await client.listAgents();
  assert.equal(agents.status, 200);
  assert.equal(Array.isArray(agents.body.agents), true);

  const dispatch = await client.dispatch({
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_sdk_dispatch",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  assert.equal(dispatch.status, 200);
  assert.equal(dispatch.body.result.task_id, "task_sdk_dispatch");
});

test("sdk client supports idempotency header on dispatch", async () => {
  let observedHeader = "";
  const transport: MapClientTransport = {
    async request<T>(input: MapClientRequest) {
      observedHeader = input.headers?.["x-map-idempotency-key"] ?? "";
      return {
        status: 200,
        body: {
          request_id: "req_123",
          result: {
            task_id: "task_sdk_idempotency",
            status: "completed",
            structured_output: {},
            followup_required: false
          }
        } as T
      };
    }
  };
  const client = new MapAssistantClient(transport);
  const response = await client.dispatch(
    {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_sdk_idempotency",
        requester_identity: { type: "user", id: "engineer_1" },
        target_agent: "dbread-agent-v1",
        intent: "Fetch incident summary",
        constraints: {
          common: { environment: "staging", redaction_level: "basic" },
          domain: { dataset: "incident_metrics", service: "payments" }
        },
        risk_class: "medium",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      }
    },
    { idempotencyKey: "idem_123" }
  );

  assert.equal(response.status, 200);
  assert.equal(observedHeader, "idem_123");
});

test("sdk client supports paginated task and receipt listing", async () => {
  const handler = createMapHandler({ includeExampleAgents: true });
  const client = new MapAssistantClient(new HandlerTransport(handler));

  for (const taskId of ["task_sdk_page_1", "task_sdk_page_2", "task_sdk_page_3"]) {
    await client.dispatch({
      capability: "db.read.aggregate",
      envelope: {
        task_id: taskId,
        requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Page test",
        constraints: {
          common: { environment: "staging", redaction_level: "basic" },
          domain: { dataset: "incident_metrics", service: "payments" }
        },
        risk_class: "medium",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      }
    });
  }

  const taskPage = await client.listTasksPage({ tenant_id: "tenant_A", limit: 2 });
  assert.equal(taskPage.status, 200);
  assert.equal(Array.isArray(taskPage.body.tasks), true);
  assert.equal(taskPage.body.tasks.length, 2);
  assert.equal(typeof taskPage.body.pagination.limit, "number");

  const receiptPage = await client.listReceiptsPage({ tenant_id: "tenant_A", limit: 2 });
  assert.equal(receiptPage.status, 200);
  assert.equal(Array.isArray(receiptPage.body.receipts), true);
  assert.equal(receiptPage.body.receipts.length, 2);
  assert.equal(typeof receiptPage.body.pagination.limit, "number");
});

test("sdk client supports paginated audit event listing", async () => {
  const handler = createMapHandler({ includeExampleAgents: true });
  const client = new MapAssistantClient(new HandlerTransport(handler));

  await client.dispatch({
    capability: "payment.execute",
    envelope: {
      task_id: "task_sdk_audit_page",
      requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
      target_agent: "payment-agent-v1",
      intent: "Generate audit event",
      constraints: {
        common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
        domain: { invoice_id: "INV-SDK", approved_vendor_only: true }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const auditPage = await client.listAuditEventsPage({ limit: 1 });
  assert.equal(auditPage.status, 200);
  assert.equal(Array.isArray(auditPage.body.events), true);
  assert.equal(auditPage.body.events.length, 1);
  assert.equal(typeof auditPage.body.pagination.limit, "number");
});

test("sdk client supports paginated alerts and dead-letter listing", async () => {
  const client = new MapAssistantClient(
    new HandlerTransport(createMapHandler({ includeExampleAgents: true }))
  );

  const alertsPage = await client.listAlertsPage({ limit: 1 });
  assert.equal(alertsPage.status, 200);
  assert.equal(Array.isArray(alertsPage.body.alerts), true);
  assert.equal(typeof alertsPage.body.pagination.limit, "number");

  const deadLettersPage = await client.listDeadLettersPage({ limit: 1 });
  assert.equal(deadLettersPage.status, 200);
  assert.equal(Array.isArray(deadLettersPage.body.dead_letters), true);
  assert.equal(typeof deadLettersPage.body.pagination.limit, "number");
});

test("sdk client retrieves signed conformance export artifact", async () => {
  const client = new MapAssistantClient(
    new HandlerTransport(createMapHandler({ includeExampleAgents: true }))
  );
  const response = await client.getConformanceExport();
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.conformance, "object");
  assert.equal(typeof response.body.artifact, "object");
});

test("sdk client retrieves signed trust bundle export", async () => {
  const client = new MapAssistantClient(
    new HandlerTransport(createMapHandler({ includeExampleAgents: true }))
  );
  const response = await client.getTrustBundleExport();
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.trust_bundle, "object");
  assert.equal(Array.isArray(response.body.keys), true);
});

test("sdk client supports admin key reflection endpoint", async () => {
  let observedPath = "";
  const transport: MapClientTransport = {
    async request<T>(input: MapClientRequest) {
      observedPath = input.path;
      return {
        status: 200,
        body: {
          keys: [{ kid: "map-rs-key-1", alg: "RS256", status: "active" }],
          summary: { active_kid: "map-rs-key-1" },
          trust: { trust_domain: "map.local", issuer: "map.reference", profile: "verified" },
          key_provider: { provider: "env", configured: true }
        } as T
      };
    }
  };
  const client = new MapAssistantClient(transport);
  const response = await client.listAdminKeys({ includeRuntime: true, includeRevoked: false });
  assert.equal(response.status, 200);
  assert.equal(observedPath, "/admin/keys?include_runtime=true&include_revoked=false");
  assert.equal(Array.isArray(response.body.keys), true);
});
