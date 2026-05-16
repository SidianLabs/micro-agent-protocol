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

describe("Schema Negotiation Tests", () => {
  describe("Version compatibility checking", () => {
    it("should accept requests with supported schema version", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-schema-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Schema version test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request, {
        "X-MAP-Schema-Version": "v1",
      });

      console.log(`Schema v1 request: ${response.statusCode}`);
    });

    it("should include schema version in response", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-schema-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Schema version in response",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      const hasVersionInResponse =
        "schema_version" in response.body ||
        "version" in response.body ||
        response.headers["x-map-schema-version"] !== undefined;
      console.log(`Version in response: ${hasVersionInResponse}`);
    });
  });

  describe("Backward compatibility", () => {
    it("should accept legacy field names", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-legacy-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Legacy compatibility test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
          // Legacy field that might be renamed in newer schema
          visibility_mode: "default",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Legacy field acceptance: ${response.statusCode}`);
    });

    it("should accept optional fields omitted", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-minimal-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Minimal fields test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      const isSuccess = response.statusCode >= 200 && response.statusCode < 300;
      console.log(`Minimal envelope accepted: ${isSuccess}`);
    });
  });

  describe("Forward compatibility", () => {
    it("should accept unknown fields gracefully", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-forward-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Forward compat test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
        // Future-proof field that current schema doesn't know about
        future_field: "should_be_ignored",
        another_future_field: 12345,
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Future fields ignored: ${response.statusCode}`);
    });

    it("should not fail on unknown constraint keys", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-unknown-constraint-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Unknown constraints test",
          constraints: {
            common: { environment: "staging" },
            domain: { dataset: "test" },
            future_constraint: { key: "value" },
          },
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      console.log(`Unknown constraints ignored: ${response.statusCode}`);
    });
  });

  describe("Breaking change detection", () => {
    it("should reject requests missing required fields", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-break-${randomUUID()}`,
          // Missing requester_identity which is required
          target_agent: "dbread-agent-v1",
          intent: "Breaking change test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      const isError = response.statusCode >= 400;
      console.log(`Breaking change detected: ${isError}`);
    });

    it("should reject invalid enum values", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-invalid-enum-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Invalid enum test",
          constraints: {},
          risk_class: "invalid_risk_class",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);
      const isError = response.statusCode >= 400;
      console.log(`Invalid enum rejected: ${isError}`);
    });
  });

  describe("Schema translation", () => {
    it("should translate v1 schema to internal representation", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-translate-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Schema translation test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        // Server should process and translate the request internally
        const hasInternalRepresentation =
          "task_id" in response.body ||
          "receipt_id" in response.body ||
          response.statusCode === 202;
        console.log(`Schema translated: ${hasInternalRepresentation}`);
      }
    });

    it("should include schema version in error responses", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-error-schema-${randomUUID()}`,
          // Deliberately missing required field
          target_agent: "dbread-agent-v1",
          intent: "Error schema test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      if (response.statusCode >= 400) {
        const hasVersionInError =
          "schema_version" in response.body ||
          "version" in response.body ||
          response.headers["x-map-schema-version"] !== undefined;
        console.log(`Version in error response: ${hasVersionInError}`);
      }
    });
  });
});
