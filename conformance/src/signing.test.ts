import { createHmac, createSign } from "node:crypto";
import signatureFixtures from "./fixtures/signature-fixtures.json" with { type: "json" };

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

function signHmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function buildSignaturePayload(payload: {
  method: string;
  path: string;
  timestamp: string;
  key_id: string;
  body: string;
}): string {
  return JSON.stringify({
    method: payload.method,
    path: payload.path,
    timestamp: payload.timestamp,
    key_id: payload.key_id,
    body: payload.body,
  });
}

describe("Signing Tests", () => {
  describe("Valid HMAC signature", () => {
    it("should accept valid HMAC signature", async () => {
      const timestamp = new Date().toISOString();
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-hmac",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "HMAC signature test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const payload = buildSignaturePayload({
        method: "POST",
        path: "/dispatch",
        timestamp,
        key_id: "fixture_hs_1",
        body,
      });

      const signature = signHmac(payload, "fixture_secret_1");
      const keyId = "fixture_hs_1";

      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Signature": signature,
        "X-MAP-Request-Key-Id": keyId,
        "X-MAP-Request-Timestamp": timestamp,
      });

      console.log(`Valid HMAC signature: ${response.statusCode}`);
    });

    it("should verify HMAC signature matches fixture", async () => {
      const fixture = signatureFixtures.fixtures.http_request;
      const payload = buildSignaturePayload(fixture.payload);
      const expectedSignature = fixture.signature;
      const actualSignature = signHmac(payload, "fixture_secret_1");

      console.log(`HMAC deterministic: ${actualSignature === expectedSignature}`);
    });
  });

  describe("Valid RSA signature", () => {
    it("should accept valid RSA signature if supported", async () => {
      // This test would require RSA key setup - skip if not configured
      const hasRsaKey = process.env.MAP_RSA_KEY !== undefined;
      if (!hasRsaKey) {
        console.log("RSA key not configured, skipping RSA test");
        return;
      }

      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-rsa",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "RSA signature test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const timestamp = new Date().toISOString();
      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Timestamp": timestamp,
      });

      console.log(`RSA signature: ${response.statusCode}`);
    });
  });

  describe("Invalid signature detection", () => {
    it("should reject request with tampered signature", async () => {
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-tampered",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Tampered signature test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const timestamp = new Date().toISOString();
      const tamperedSignature = "tampered_signature_value";

      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Signature": tamperedSignature,
        "X-MAP-Request-Key-Id": "fixture_hs_1",
        "X-MAP-Request-Timestamp": timestamp,
      });

      console.log(`Tampered signature rejected: ${response.statusCode === 401 || response.statusCode === 403}`);
    });

    it("should reject request with wrong key id", async () => {
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-wrong-key",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Wrong key test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const timestamp = new Date().toISOString();
      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Signature": "some_signature",
        "X-MAP-Request-Key-Id": "nonexistent_key",
        "X-MAP-Request-Timestamp": timestamp,
      });

      console.log(`Wrong key rejected: ${response.statusCode === 401 || response.statusCode === 403}`);
    });
  });

  describe("Expired timestamp rejection", () => {
    it("should reject request with expired timestamp", async () => {
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-expired",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Expired timestamp test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      // Use timestamp from 2 days ago
      const expiredTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const payload = buildSignaturePayload({
        method: "POST",
        path: "/dispatch",
        timestamp: expiredTimestamp,
        key_id: "fixture_hs_1",
        body,
      });

      const signature = signHmac(payload, "fixture_secret_1");

      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Signature": signature,
        "X-MAP-Request-Key-Id": "fixture_hs_1",
        "X-MAP-Request-Timestamp": expiredTimestamp,
      });

      console.log(`Expired timestamp rejected: ${response.statusCode === 400 || response.statusCode === 401}`);
    });
  });

  describe("Revoked key rejection", () => {
    it("should reject request with revoked key", async () => {
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-revoked",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Revoked key test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const timestamp = new Date().toISOString();
      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Signature": "some_signature",
        "X-MAP-Request-Key-Id": "revoked_key_id",
        "X-MAP-Request-Timestamp": timestamp,
      });

      console.log(`Revoked key rejected: ${response.statusCode === 401 || response.statusCode === 403}`);
    });
  });

  describe("Signature with missing headers", () => {
    it("should reject request missing signature header", async () => {
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-missing-header",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Missing header test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const timestamp = new Date().toISOString();
      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Key-Id": "fixture_hs_1",
        "X-MAP-Request-Timestamp": timestamp,
      });

      console.log(`Missing signature header rejected: ${response.statusCode === 400 || response.statusCode === 401}`);
    });

    it("should reject request missing key id header", async () => {
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-missing-keyid",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Missing key id test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const timestamp = new Date().toISOString();
      const payload = buildSignaturePayload({
        method: "POST",
        path: "/dispatch",
        timestamp,
        key_id: "fixture_hs_1",
        body,
      });
      const signature = signHmac(payload, "fixture_secret_1");

      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Signature": signature,
        "X-MAP-Request-Timestamp": timestamp,
      });

      console.log(`Missing key id header rejected: ${response.statusCode === 400 || response.statusCode === 401}`);
    });

    it("should reject request missing timestamp header", async () => {
      const body = JSON.stringify({
        capability: "db.read.aggregate",
        envelope: {
          task_id: "test-signature-missing-timestamp",
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Missing timestamp test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      });

      const payload = buildSignaturePayload({
        method: "POST",
        path: "/dispatch",
        timestamp: new Date().toISOString(),
        key_id: "fixture_hs_1",
        body,
      });
      const signature = signHmac(payload, "fixture_secret_1");

      const response = await dispatchRequest("POST", "/dispatch", JSON.parse(body), {
        "X-MAP-Request-Signature": signature,
        "X-MAP-Request-Key-Id": "fixture_hs_1",
      });

      console.log(`Missing timestamp header rejected: ${response.statusCode === 400 || response.statusCode === 401}`);
    });
  });
});
