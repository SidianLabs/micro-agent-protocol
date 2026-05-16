import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  getTrustMetadata,
  getSignatureKeyId,
  getVerificationKeys,
  signAuditExport,
  signHttpRequest,
  signTrustBundle,
  verifyAuditExportSignature,
  verifyHttpRequestSignature,
  verifyTrustBundleSignature,
  verifyNonce,
} from "../security/signing.js";

function withSigningEnv(
  values: Record<string, string | undefined>,
  fn: () => void,
): void {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("signing keyring exposes configured keys and active kid signs payload", () => {
  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_old",
          secret: "old_secret",
          status: "retiring",
          demo_only: false,
        },
        {
          kid: "kid_new",
          secret: "new_secret",
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_new",
    },
    () => {
      const keys = getVerificationKeys();
      assert.equal(keys.length, 2);
      assert.equal(
        keys.some((key) => key.kid === "kid_old"),
        true,
      );
      assert.equal(
        keys.some((key) => key.kid === "kid_new"),
        true,
      );

      const payload = {
        export_id: "audit-export:test",
        created_at: new Date().toISOString(),
        events_count: 1,
        checkpoints_count: 0,
        latest_chain_index: 1,
        latest_event_hash: "abc",
      };
      const signature = signAuditExport(payload);
      const header = JSON.parse(
        Buffer.from(signature.split(".")[0], "base64url").toString("utf8"),
      ) as { kid: string };
      assert.equal(header.kid, "kid_new");
      assert.equal(getSignatureKeyId(signature), "kid_new");
      assert.equal(verifyAuditExportSignature(payload, signature), true);
    },
  );
});

test("verification accepts previously-signed payloads after active key rotation", () => {
  const payload = {
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "kid_old",
    body: JSON.stringify({ hello: "world" }),
  };

  let signature = "";
  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_old",
          secret: "old_secret",
          status: "retiring",
          demo_only: false,
        },
        {
          kid: "kid_new",
          secret: "new_secret",
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_old",
    },
    () => {
      signature = signHttpRequest(payload)["x-map-request-signature"];
    },
  );

  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_old",
          secret: "old_secret",
          status: "retiring",
          demo_only: false,
        },
        {
          kid: "kid_new",
          secret: "new_secret",
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_new",
    },
    () => {
      const valid = verifyHttpRequestSignature({
        ...payload,
        signature,
      });
      assert.equal(valid, true);
    },
  );
});

test("verification rejects signatures from revoked keys", () => {
  const payload = {
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "kid_old",
    body: JSON.stringify({ hello: "world" }),
  };

  let signature = "";
  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_old",
          secret: "old_secret",
          status: "retiring",
          demo_only: false,
        },
        {
          kid: "kid_new",
          secret: "new_secret",
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_old",
      MAP_SIGNING_REVOKED_KIDS: undefined,
    },
    () => {
      signature = signHttpRequest(payload)["x-map-request-signature"];
    },
  );

  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_old",
          secret: "old_secret",
          status: "retiring",
          demo_only: false,
        },
        {
          kid: "kid_new",
          secret: "new_secret",
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_REVOKED_KIDS: "kid_old",
      MAP_SIGNING_ACTIVE_KID: "kid_new",
    },
    () => {
      const keys = getVerificationKeys();
      const oldKey = keys.find((key) => key.kid === "kid_old");
      assert.equal(oldKey?.status, "revoked");

      const valid = verifyHttpRequestSignature({
        ...payload,
        signature,
      });
      assert.equal(valid, false);
    },
  );
});

test("signing supports RS256 asymmetric keys", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const privatePem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const payload = {
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "kid_rsa",
    body: JSON.stringify({ hello: "world" }),
  };

  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_rsa",
          alg: "RS256",
          private_key_pem: privatePem,
          public_key_pem: publicPem,
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_rsa",
      MAP_SIGNING_REVOKED_KIDS: undefined,
    },
    () => {
      const keys = getVerificationKeys();
      assert.equal(keys[0].alg, "RS256");
      assert.equal(keys[0].kty, "RSA");
      assert.equal(typeof keys[0].public_key_pem, "string");

      const signature = signHttpRequest(payload)["x-map-request-signature"];
      const valid = verifyHttpRequestSignature({
        ...payload,
        signature,
      });
      assert.equal(valid, true);
    },
  );
});

test("signing supports file-backed key provider configuration", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-key-provider-"));
  const keysetPath = join(tempDir, "keyset.json");
  try {
    writeFileSync(
      keysetPath,
      JSON.stringify([
        {
          kid: "kid_file_1",
          secret: "file_secret_1",
          status: "active",
          demo_only: false,
        },
      ]),
      "utf8",
    );

    const payload = {
      method: "POST",
      path: "/dispatch",
      timestamp: new Date().toISOString(),
      key_id: "kid_file_1",
      body: JSON.stringify({ hello: "world" }),
    };

    withSigningEnv(
      {
        MAP_KEY_PROVIDER: "file_keyset",
        MAP_KMS_KEYSET_PATH: keysetPath,
        MAP_SIGNING_KEYS: undefined,
        MAP_SIGNING_ACTIVE_KID: "kid_file_1",
        MAP_SIGNING_REVOKED_KIDS: undefined,
      },
      () => {
        const keys = getVerificationKeys();
        assert.equal(keys.length, 1);
        assert.equal(keys[0]?.kid, "kid_file_1");

        const signature = signHttpRequest(payload)["x-map-request-signature"];
        const valid = verifyHttpRequestSignature({
          ...payload,
          signature,
        });
        assert.equal(valid, true);
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("signing enforces key scope for http_request signatures", () => {
  const payload = {
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "kid_receipt_only",
    body: JSON.stringify({ hello: "world" }),
  };

  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_receipt_only",
          secret: "receipt_only_secret",
          status: "active",
          demo_only: false,
          scopes: ["receipt"],
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_receipt_only",
    },
    () => {
      assert.throws(
        () => signHttpRequest(payload),
        /not authorized for scope http_request/,
      );
    },
  );
});

test("trust bundle signature verifies against exported payload", () => {
  const payload = {
    bundle_id: "trust-bundle:test",
    created_at: new Date().toISOString(),
    trust_domain: "map.local",
    issuer: "map.reference",
    profile: "verified" as const,
    keys_hash: "abc123",
  };
  withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_trust",
          secret: "trust_secret",
          status: "active",
          demo_only: false,
          scopes: ["trust_bundle"],
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_trust",
      MAP_TRUST_DOMAIN: "map.local",
      MAP_SIGNING_ISSUER: "map.reference",
    },
    () => {
      const signature = signTrustBundle(payload);
      assert.equal(verifyTrustBundleSignature(payload, signature), true);
      const trust = getTrustMetadata("verified");
      assert.equal(trust.trust_domain, "map.local");
      assert.equal(trust.issuer, "map.reference");
      assert.equal(trust.profile, "verified");
    },
  );
});

// ── Replay Hardening Tests Under Skew/Races (Step 29) ────────────────────

const SKEW_SIGNING_KID = "kid_replay";

function withReplayEnv(fn: () => void) {
  return withSigningEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: SKEW_SIGNING_KID,
          secret: "replay_secret",
          status: "active",
          demo_only: false,
          scopes: ["http_request"],
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: SKEW_SIGNING_KID,
      MAP_REQUEST_MAX_AGE_MS: String(5 * 60 * 1000), // 5 min default
    },
    fn,
  );
}

test("clock skew within tolerance: timestamp 4 min in the past should ACCEPT", () => {
  withReplayEnv(() => {
    const pastTimestamp = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const payload = {
      method: "POST",
      path: "/dispatch",
      timestamp: pastTimestamp,
      key_id: SKEW_SIGNING_KID,
      body: JSON.stringify({ test: "skew_ok" }),
    };
    const headers = signHttpRequest(payload);
    const valid = verifyHttpRequestSignature({
      ...payload,
      signature: headers["x-map-request-signature"],
      nonce: headers["x-map-nonce"],
    });
    assert.equal(valid, true, "should accept within 5 min skew window");
  });
});

test("clock skew outside tolerance: timestamp 6 min in the past should REJECT", () => {
  withReplayEnv(() => {
    const pastTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const payload = {
      method: "POST",
      path: "/dispatch",
      timestamp: pastTimestamp,
      key_id: SKEW_SIGNING_KID,
      body: JSON.stringify({ test: "skew_bad" }),
    };
    const headers = signHttpRequest(payload);
    const valid = verifyHttpRequestSignature({
      ...payload,
      signature: headers["x-map-request-signature"],
      nonce: headers["x-map-nonce"],
    });
    assert.equal(valid, false, "should reject outside 5 min skew window");
  });
});

test("future timestamp within tolerance: 1 min in the future should ACCEPT", () => {
  withReplayEnv(() => {
    const futureTimestamp = new Date(Date.now() + 1 * 60 * 1000).toISOString();
    const payload = {
      method: "POST",
      path: "/dispatch",
      timestamp: futureTimestamp,
      key_id: SKEW_SIGNING_KID,
      body: JSON.stringify({ test: "future_ok" }),
    };
    const headers = signHttpRequest(payload);
    const valid = verifyHttpRequestSignature({
      ...payload,
      signature: headers["x-map-request-signature"],
      nonce: headers["x-map-nonce"],
    });
    assert.equal(valid, true, "should accept 1 min future within abs window");
  });
});

test("far future timestamp: 10 min in the future should REJECT", () => {
  withReplayEnv(() => {
    const futureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const payload = {
      method: "POST",
      path: "/dispatch",
      timestamp: futureTimestamp,
      key_id: SKEW_SIGNING_KID,
      body: JSON.stringify({ test: "future_bad" }),
    };
    const headers = signHttpRequest(payload);
    const valid = verifyHttpRequestSignature({
      ...payload,
      signature: headers["x-map-request-signature"],
      nonce: headers["x-map-nonce"],
    });
    assert.equal(
      valid,
      false,
      "should reject 10 min future outside abs window",
    );
  });
});

test("duplicate nonce: second use of same nonce should REJECT", () => {
  const nonce = "test-nonce-dup-1";
  const first = verifyNonce(nonce);
  assert.equal(first, true, "first use should be accepted");
  const second = verifyNonce(nonce);
  assert.equal(second, false, "second use of same nonce should be rejected");
});

test("race condition: 10 concurrent requests with same nonce — only ONE succeeds", async () => {
  const nonce = "test-nonce-race-1";
  const results = await Promise.all(
    Array.from({ length: 10 }, () => Promise.resolve(verifyNonce(nonce))),
  );
  const accepted = results.filter(Boolean).length;
  const rejected = results.filter((r) => !r).length;
  assert.equal(accepted, 1, "exactly one should be accepted");
  assert.equal(rejected, 9, "nine should be rejected as replays");
});

test("nonce cache expiry: nonce accepted again after expiry", async () => {
  const nonce = "test-nonce-expiry-1";
  // Use a very short maxAge so we can test expiry without waiting 5 minutes
  const shortMaxAgeMs = 50;
  const first = verifyNonce(nonce, shortMaxAgeMs);
  assert.equal(first, true, "first use should be accepted");

  // Within expiry window — should still be rejected
  const second = verifyNonce(nonce, shortMaxAgeMs);
  assert.equal(second, false, "within expiry window should be rejected");

  // Wait for the nonce to expire
  await delay(shortMaxAgeMs + 20);

  // After expiry — should be accepted again
  const third = verifyNonce(nonce, shortMaxAgeMs);
  assert.equal(third, true, "after expiry should be accepted again");
});
