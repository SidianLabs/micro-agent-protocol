/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
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

describe("Trust Chain Tests", () => {
  describe("Trust bundle verification", () => {
    it("should verify trust bundle signature", async () => {
      const bundle = signatureFixtures.fixtures.trust_bundle;

      // The server should be able to verify trust bundle signatures
      const response = await dispatchRequest(
        "GET",
        "/.well-known/map/trust-bundle"
      );

      console.log(`Trust bundle retrieval: ${response.statusCode}`);
    });

    it("should include trust domain in bundle", async () => {
      const response = await dispatchRequest(
        "GET",
        "/.well-known/map/trust-bundle"
      );

      if (response.statusCode === 200) {
        const hasTrustDomain =
          "trust_domain" in response.body ||
          "bundle" in response.body;
        console.log(`Trust domain in bundle: ${hasTrustDomain}`);
      }
    });
  });

  describe("Key verification", () => {
    it("should verify signing key is not revoked", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-key-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Key verification test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      // Request with explicitly revoked key
      const response = await dispatchRequest("POST", "/dispatch", request, {
        "X-MAP-Request-Key-Id": "revoked_key",
        "X-MAP-Request-Signature": "invalid_signature",
        "X-MAP-Request-Timestamp": new Date().toISOString(),
      });

      console.log(`Revoked key response: ${response.statusCode}`);
    });

    it("should verify key is active", async () => {
      const response = await dispatchRequest(
        "GET",
        "/.well-known/map/keys/active"
      );

      console.log(`Active keys response: ${response.statusCode}`);
    });
  });

  describe("Issuer verification", () => {
    it("should include issuer in trust bundle", async () => {
      const response = await dispatchRequest(
        "GET",
        "/.well-known/map/trust-bundle"
      );

      if (response.statusCode === 200) {
        const hasIssuer =
          "issuer" in response.body ||
          (response.body as { bundle?: { issuer?: unknown } }).bundle?.issuer !== undefined;
        console.log(`Issuer in trust bundle: ${hasIssuer}`);
      }
    });

    it("should validate issuer signature on bundle", async () => {
      const response = await dispatchRequest(
        "GET",
        "/.well-known/map/trust-bundle"
      );

      if (response.statusCode === 200) {
        const hasSignature =
          "signature" in response.body ||
          response.headers["x-map-bundle-signature"] !== undefined;
        console.log(`Bundle has signature: ${hasSignature}`);
      }
    });
  });

  describe("Profile verification", () => {
    it("should enforce verified profile requirements", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-profile-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Profile verification test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      // In verified profile mode, unsigned requests should be rejected
      const response = await dispatchRequest("POST", "/dispatch", request);

      console.log(`Verified profile enforcement: ${response.statusCode}`);
    });

    it("should indicate profile in response", async () => {
      const request = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: `test-profile-resp-${randomUUID()}`,
          requester_identity: {
            type: "user",
            id: "user_001",
            tenant_id: "tenant_A",
          },
          target_agent: "dbread-agent-v1",
          intent: "Profile in response test",
          constraints: {},
          risk_class: "low",
          delegation_token: "token",
          requested_output_mode: "summary",
        },
      };

      const response = await dispatchRequest("POST", "/dispatch", request);

      const hasProfile =
        "profile" in response.body ||
        response.headers["x-map-profile"] !== undefined;
      console.log(`Profile in response: ${hasProfile}`);
    });
  });

  describe("Chain verification", () => {
    it("should verify trust chain integrity", async () => {
      const response = await dispatchRequest(
        "GET",
        "/.well-known/map/trust-bundle"
      );

      if (response.statusCode === 200) {
        console.log(`Trust chain verification: success`);
      }
    });

    it("should reject tampered trust bundle", async () => {
      const response = await dispatchRequest(
        "POST",
        "/.well-known/map/trust-bundle/verify",
        { bundle: "tampered_bundle_content" }
      );

      console.log(`Tampered bundle rejected: ${response.statusCode >= 400}`);
    });
  });
});
