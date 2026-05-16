/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { IncomingMessage } from "node:http";
import { getBearerTokenError } from "../server/middleware/auth.js";

function makeMockRequest(headers: Record<string, string | undefined>): IncomingMessage {
  return {
    headers,
  } as unknown as IncomingMessage;
}

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

// ── getBearerTokenError unit tests ──────────────────────────────────────────

test("getBearerTokenError: rejects when no Authorization header", async () => {
  await withEnv({}, async () => {
    const req = makeMockRequest({});
    const result = getBearerTokenError(req);
    assert.ok(result, "should return error when no Authorization header");
    assert.equal(result!.code, "auth_required");
  });
});

test("getBearerTokenError: rejects when Authorization header is not Bearer", async () => {
  await withEnv({}, async () => {
    const req = makeMockRequest({ "authorization": "Basic abc123" });
    const result = getBearerTokenError(req);
    assert.ok(result, "should return error for non-Bearer auth");
    assert.equal(result!.code, "auth_required");
  });
});

test("getBearerTokenError: rejects empty Bearer token", async () => {
  await withEnv({}, async () => {
    const req = makeMockRequest({ "authorization": "Bearer " });
    const result = getBearerTokenError(req);
    assert.ok(result, "should return error for empty Bearer token");
    assert.equal(result!.code, "invalid_auth");
  });
});

test("getBearerTokenError: rejects when no OAuth config is present", async () => {
  await withEnv(
    {
      MAP_OAUTH_STATIC_TOKEN: undefined,
      MAP_OAUTH_JWKS_URL: undefined,
    },
    async () => {
      const req = makeMockRequest({ "authorization": "Bearer my-arbitrary-token" });
      const result = getBearerTokenError(req);
      assert.ok(result, "should reject when neither static token nor JWKS URL is configured");
      assert.equal(result!.code, "invalid_auth");
    },
  );
});

test("getBearerTokenError: accepts valid static token", async () => {
  const staticToken = "test-static-token-xyz";
  await withEnv(
    {
      MAP_OAUTH_STATIC_TOKEN: staticToken,
      MAP_OAUTH_JWKS_URL: undefined,
    },
    async () => {
      const req = makeMockRequest({ "authorization": `Bearer ${staticToken}` });
      const result = getBearerTokenError(req);
      assert.equal(result, null, "valid static token should be accepted");
    },
  );
});

test("getBearerTokenError: rejects wrong static token", async () => {
  await withEnv(
    {
      MAP_OAUTH_STATIC_TOKEN: "correct-token",
      MAP_OAUTH_JWKS_URL: undefined,
    },
    async () => {
      const req = makeMockRequest({ "authorization": "Bearer wrong-token" });
      const result = getBearerTokenError(req);
      assert.ok(result, "wrong static token should be rejected");
      assert.equal(result!.code, "invalid_auth");
    },
  );
});

test("getBearerTokenError: rejects non-JWT token in JWKS mode", async () => {
  await withEnv(
    {
      MAP_OAUTH_STATIC_TOKEN: undefined,
      MAP_OAUTH_JWKS_URL: "https://example.com/jwks",
    },
    async () => {
      const req = makeMockRequest({ "authorization": "Bearer not-a-valid-jwt" });
      const result = getBearerTokenError(req);
      assert.ok(result, "non-JWT should be rejected in JWKS mode");
      assert.equal(result!.code, "invalid_auth");
    },
  );
});

test("getBearerTokenError: rejects expired JWT in JWKS mode", async () => {
  await withEnv(
    {
      MAP_OAUTH_STATIC_TOKEN: undefined,
      MAP_OAUTH_JWKS_URL: "https://example.com/jwks",
    },
    async () => {
      const expiredPayload = {
        sub: "user_1",
        exp: Math.floor(Date.now() / 1000) - 3600,
      };
      const token = [
        "header",
        Buffer.from(JSON.stringify(expiredPayload)).toString("base64url"),
        "signature",
      ].join(".");

      const req = makeMockRequest({ "authorization": `Bearer ${token}` });
      const result = getBearerTokenError(req);
      assert.ok(result, "expired JWT should be rejected");
      assert.equal(result!.code, "token_expired");
    },
  );
});

test("getBearerTokenError: accepts valid unexpired JWT in JWKS mode (exp check only)", async () => {
  await withEnv(
    {
      MAP_OAUTH_STATIC_TOKEN: undefined,
      MAP_OAUTH_JWKS_URL: "https://example.com/jwks",
    },
    async () => {
      const validPayload = {
        sub: "user_1",
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = [
        "header",
        Buffer.from(JSON.stringify(validPayload)).toString("base64url"),
        "signature",
      ].join(".");

      const req = makeMockRequest({ "authorization": `Bearer ${token}` });
      const result = getBearerTokenError(req);
      assert.equal(result, null, "valid unexpired JWT should pass exp check in JWKS mode");
    },
  );
});

test("getBearerTokenError: rejects JWT missing exp claim in JWKS mode", async () => {
  await withEnv(
    {
      MAP_OAUTH_STATIC_TOKEN: undefined,
      MAP_OAUTH_JWKS_URL: "https://example.com/jwks",
    },
    async () => {
      const noExpPayload = { sub: "user_1" };
      const token = [
        "header",
        Buffer.from(JSON.stringify(noExpPayload)).toString("base64url"),
        "signature",
      ].join(".");

      const req = makeMockRequest({ "authorization": `Bearer ${token}` });
      const result = getBearerTokenError(req);
      assert.ok(result, "JWT without exp should be rejected");
      assert.equal(result!.code, "invalid_auth");
    },
  );
});