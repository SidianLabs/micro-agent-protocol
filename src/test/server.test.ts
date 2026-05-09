import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import {
  getSignatureKeyId,
  signHttpRequest,
  verifyAgentDescriptorSignature,
  verifyAuditCheckpointSignature,
  verifyAuditExportSignature,
  verifyConformanceExportSignature,
  verifyTrustBundleSignature
} from "../src/security/signing.js";
import { createMapHandler } from "../src/server.js";

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
  const handler = createMapHandler({ includeExampleAgents: true, ...(options ?? {}) });

  return async function dispatch(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ) {
    const req = makeRequest(method, url, body, headers);
    const res = new MockResponse();
    await handler(req as never, res as never);
    const parsedBody = res.body && res.body.trim().length > 0 ? JSON.parse(res.body) : {};
    return {
      statusCode: res.statusCode,
      body: parsedBody,
      headers: res.headers
    };
  };
}

function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
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

test("server returns structured invalid_request error for bad payload", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("POST", "/dispatch", {
    capability: "",
    envelope: {}
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "invalid_request");
  assert.equal(typeof response.body.error.retryable, "boolean");
  assert.equal(response.body.error.retryable, false);
});

test("server returns agents list", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/agents");

  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.body.agents));
  assert.ok(response.body.agents.length >= 2);
  assert.equal(
    response.body.agents.every((agent: { descriptor_signature: string }) =>
      typeof agent.descriptor_signature === "string"
    ),
    true
  );
});

test("server exposes provider discovery bootstrap document", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/.well-known/map", undefined, {
    host: "provider.example.com"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.protocol.name, "MAP");
  assert.equal(response.body.protocol.discovery_version, "v1");
  assert.equal(typeof response.body.provider.provider_id, "string");
  assert.equal(typeof response.body.provider.display_name, "string");
  assert.equal(response.body.trust.key_discovery_url, "http://provider.example.com/.well-known/map-keys");
  assert.equal(response.body.documentation.agents_url, "http://provider.example.com/agents");
  assert.ok(Array.isArray(response.body.agents.items));
  assert.ok(response.body.agents.items.length >= 2);
  assert.equal(response.headers["cache-control"], "public, max-age=300, must-revalidate");
  assert.equal(typeof response.headers.etag, "string");
});

test("server provider discovery supports etag conditional requests", async () => {
  const dispatch = createDispatcher();
  const first = await dispatch("GET", "/.well-known/map");
  const second = await dispatch("GET", "/.well-known/map", undefined, {
    "if-none-match": first.headers.etag ?? ""
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 304);
});

test("server exposes key discovery metadata", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/.well-known/map-keys");

  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.body.keys));
  assert.equal(response.body.keys[0].kid, "map-dev-key-1");
  assert.equal(response.body.keys[0].demo_only, true);
  assert.equal(response.body.active_kid, "map-dev-key-1");
  assert.equal(response.body.signing_profile, "symmetric");
  assert.equal(typeof response.body.trust.trust_domain, "string");
  assert.equal(typeof response.body.trust.issuer, "string");
  assert.equal(response.body.trust.profile, "open");
});

test("server key discovery marks revoked keys", async () => {
  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "kid_old", secret: "old_secret", status: "retiring", demo_only: false },
        { kid: "kid_new", secret: "new_secret", status: "active", demo_only: false }
      ]),
      MAP_SIGNING_REVOKED_KIDS: "kid_old"
    },
    async () => {
      const dispatch = createDispatcher();
      const response = await dispatch("GET", "/.well-known/map-keys");

      assert.equal(response.statusCode, 200);
      const oldKey = response.body.keys.find((key: { kid: string }) => key.kid === "kid_old");
      assert.equal(oldKey?.status, "revoked");
    }
  );
});

test("server key discovery reflects RS256 public key details", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_rsa_http",
          alg: "RS256",
          private_key_pem: privatePem,
          public_key_pem: publicPem,
          status: "active",
          demo_only: false
        }
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_rsa_http"
    },
    async () => {
      const dispatch = createDispatcher();
      const response = await dispatch("GET", "/.well-known/map-keys");

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.active_kid, "kid_rsa_http");
      assert.equal(response.body.signing_profile, "mixed_or_asymmetric");
      assert.equal(response.body.keys[0].alg, "RS256");
      assert.equal(response.body.keys[0].kty, "RSA");
      assert.equal(typeof response.body.keys[0].public_key_pem, "string");
      assert.equal(typeof response.body.keys[0].jwk?.kty, "string");
    }
  );
});

test("server key discovery supports jwk mode without pem and sets cache headers", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_rsa_http_jwk",
          alg: "RS256",
          private_key_pem: privatePem,
          public_key_pem: publicPem,
          status: "active",
          demo_only: false
        }
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_rsa_http_jwk",
      MAP_KEY_DISCOVERY_CACHE_MAX_AGE_SEC: "120"
    },
    async () => {
      const dispatch = createDispatcher();
      const response = await dispatch("GET", "/.well-known/map-keys?format=jwk");

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.keys[0].kty, "RSA");
      assert.equal(response.body.keys[0].public_key_pem, undefined);
      assert.equal(typeof response.body.keys[0].jwk?.kty, "string");
      assert.equal(response.body.rotation_hints.cache_max_age_sec, 120);
      assert.equal(
        response.headers["cache-control"],
        "public, max-age=120, must-revalidate"
      );
    }
  );
});

test("server key discovery supports pagination and etag conditional requests", async () => {
  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "kid_a", secret: "a", status: "active", demo_only: false },
        { kid: "kid_b", secret: "b", status: "active", demo_only: false },
        { kid: "kid_c", secret: "c", status: "active", demo_only: false }
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_b",
      MAP_KEY_DISCOVERY_CACHE_MAX_AGE_SEC: "30"
    },
    async () => {
      const dispatch = createDispatcher();
      const page1 = await dispatch("GET", "/.well-known/map-keys?limit=2");
      assert.equal(page1.statusCode, 200);
      assert.equal(page1.body.keys.length, 2);
      assert.equal(typeof page1.body.pagination.next_cursor, "string");
      assert.equal(typeof page1.headers["etag"], "string");

      const page2 = await dispatch(
        "GET",
        `/.well-known/map-keys?limit=2&cursor=${encodeURIComponent(
          page1.body.pagination.next_cursor
        )}`
      );
      assert.equal(page2.statusCode, 200);
      assert.equal(page2.body.keys.length, 1);

      const notModified = await dispatch("GET", "/.well-known/map-keys?limit=2", undefined, {
        "if-none-match": page1.headers["etag"]
      });
      assert.equal(notModified.statusCode, 304);
    }
  );
});

test("server health is ok by default and includes queue checks", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/health");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(typeof response.body.checks.queue.dead_letter_count, "number");
});

test("server health degrades when dead-letter count exceeds threshold", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-health-"));
  const deadLetterStorePath = join(tempDir, "dead-letters.json");

  try {
    writeFileSync(
      deadLetterStorePath,
      JSON.stringify(
        {
          dead_letters: [
            {
              task_id: "task_dlq_health",
              tenant_id: "tenant_A",
              attempts: 3,
              error: "permanent_failure",
              timestamp: new Date().toISOString()
            }
          ]
        },
        null,
        2
      )
    );

    const dispatch = createDispatcher({
      deadLetterStorePath,
      healthMaxDeadLetters: 0
    });
    const response = await dispatch("GET", "/health");

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "degraded");
    assert.equal(
      response.body.checks.degraded_reasons.includes("dead_letter_count_exceeded"),
      true
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server readiness is ready when configured stores are writable", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-ready-"));
  try {
    const dispatch = createDispatcher({
      taskStorePath: join(tempDir, "task-store.json"),
      deadLetterStorePath: join(tempDir, "dead-letters.json"),
      metricsStorePath: join(tempDir, "metrics.json")
    });
    const response = await dispatch("GET", "/ready");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "ready");
    assert.equal(response.body.checks.task_store.writable, true);
    assert.equal(response.body.checks.dead_letter_store.writable, true);
    assert.equal(response.body.checks.metrics_store.writable, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server readiness is not_ready when a configured store path is not writable", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-not-ready-"));
  const blocker = join(tempDir, "blocker-file");
  writeFileSync(blocker, "x", "utf8");

  try {
    const dispatch = createDispatcher({
      taskStorePath: join(blocker, "task-store.json")
    });
    const response = await dispatch("GET", "/ready");
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.status, "not_ready");
    assert.equal(response.body.checks.task_store.configured, true);
    assert.equal(response.body.checks.task_store.writable, false);
    assert.equal(typeof response.body.checks.task_store.error, "string");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server readiness is not_ready when regulated deployment profile constraints are violated", async () => {
  const dispatch = createDispatcher({
    deploymentProfile: "regulated",
    enforceSignedRequests: true,
    requireTenant: false
  });
  const response = await dispatch("GET", "/ready");

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "not_ready");
  assert.equal(response.body.checks.deployment_profile.profile, "regulated");
  assert.equal(response.body.checks.deployment_profile.compliant, false);
  assert.equal(
    Array.isArray(response.body.checks.deployment_profile.violations),
    true
  );
});

test("server readiness is not_ready when verified profile uses non-asymmetric signing keys", async () => {
  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "verified_hs256",
          secret: "verified_hs_secret",
          status: "active",
          demo_only: false
        }
      ]),
      MAP_SIGNING_ACTIVE_KID: "verified_hs256"
    },
    async () => {
      const dispatch = createDispatcher({
        deploymentProfile: "verified",
        enforceSignedRequests: true
      });
      const response = await dispatch("GET", "/ready");
      assert.equal(response.statusCode, 503);
      assert.equal(response.body.status, "not_ready");
      assert.equal(response.body.checks.deployment_profile.profile, "verified");
      assert.equal(response.body.checks.deployment_profile.compliant, false);
      assert.equal(
        response.body.checks.deployment_profile.violations.includes("active_key_not_rs256"),
        true
      );
    }
  );
});

test("server readiness is ready when verified deployment profile constraints are satisfied", async () => {
  const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = keyPair.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const publicKeyPem = keyPair.publicKey.export({ type: "pkcs1", format: "pem" }).toString();
  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "verified_rs256",
          alg: "RS256",
          private_key_pem: privateKeyPem,
          public_key_pem: publicKeyPem,
          status: "active",
          demo_only: false
        }
      ]),
      MAP_SIGNING_ACTIVE_KID: "verified_rs256"
    },
    async () => {
      const dispatch = createDispatcher({
        deploymentProfile: "verified",
        enforceSignedRequests: true
      });
      const response = await dispatch("GET", "/ready");
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.status, "ready");
      assert.equal(response.body.checks.deployment_profile.profile, "verified");
      assert.equal(response.body.checks.deployment_profile.compliant, true);
    }
  );
});

test("server status exposes effective non-secret runtime config", async () => {
  const dispatch = createDispatcher({
    enforceSignedRequests: true,
    requireTenant: true,
    asyncQueueMaxAttempts: 7,
    asyncQueueRetryDelayMs: 123,
    asyncQueueMaxRetryDelayMs: 456,
    asyncQueueRetryJitterRatio: 0.35,
    asyncQueueMaxConcurrent: 9,
    asyncQueueMaxConcurrentPerTenant: 3,
    asyncQueueMaxQueueDepth: 777,
    asyncQueueMaxDeadLetters: 321,
    healthMaxDeadLetters: 11,
    healthMaxOldestDeadLetterAgeMs: 2222,
    metricsWindowMs: 4444,
    metricsMaxLatencySamplesPerCapability: 55,
    metricsFailureRateThreshold: 0.07,
    auditMaxEvents: 1234,
    auditCheckpointInterval: 9,
    taskStorePath: "/tmp/task-store.json",
    deadLetterStorePath: "/tmp/dead-letters.json",
    metricsStorePath: "/tmp/metrics.json",
    auditStorePath: "/tmp/audit-events.json"
  });
  const response = await dispatch("GET", "/status");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.config.enforce_signed_requests, true);
  assert.equal(response.body.config.require_tenant, true);
  assert.equal(response.body.config.async_queue.max_attempts, 7);
  assert.equal(response.body.config.async_queue.retry_delay_ms, 123);
  assert.equal(response.body.config.async_queue.max_retry_delay_ms, 456);
  assert.equal(response.body.config.async_queue.retry_jitter_ratio, 0.35);
  assert.equal(response.body.config.async_queue.max_concurrent, 9);
  assert.equal(response.body.config.async_queue.max_concurrent_per_tenant, 3);
  assert.equal(response.body.config.async_queue.max_queue_depth, 777);
  assert.equal(response.body.config.async_queue.max_dead_letters, 321);
  assert.equal(response.body.config.health_thresholds.dead_letter_count, 11);
  assert.equal(response.body.config.health_thresholds.oldest_dead_letter_age_ms, 2222);
  assert.equal(response.body.config.metrics.window_ms, 4444);
  assert.equal(response.body.config.metrics.max_latency_samples_per_capability, 55);
  assert.equal(response.body.config.metrics.failure_rate_threshold, 0.07);
  assert.equal(response.body.config.audit.max_events, 1234);
  assert.equal(response.body.config.audit.checkpoint_interval, 9);
  assert.equal(response.body.config.audit.store_configured, true);
  assert.equal(Array.isArray(response.body.config.signing.verification_keys), true);
  assert.equal(typeof response.body.config.signing.key_usage, "object");
  assert.equal(typeof response.body.config.signing.key_provider.provider, "string");
  assert.equal(typeof response.body.config.signing.key_provider.configured, "boolean");
  assert.equal(typeof response.body.config.signing.anomalies, "object");
  assert.equal(
    typeof response.body.config.signing.anomalies.unknown_key_usage_detected,
    "boolean"
  );
  assert.equal(
    typeof response.body.config.signing.anomalies.retiring_key_usage_detected,
    "boolean"
  );
  assert.equal(typeof response.body.config.signing.anomalies.severity, "string");
  assert.equal(typeof response.body.config.signing.anomalies.recommended_action, "string");
  assert.equal(typeof response.body.config.signing.anomalies.unknown_key_usage_ratio, "number");
  assert.equal(typeof response.body.config.signing.anomalies.retiring_key_usage_ratio, "number");
  assert.equal(typeof response.body.config.signing.anomalies.total_signatures_analyzed, "number");
  assert.equal(typeof response.body.config.signing.anomalies.thresholds, "object");
  assert.equal(typeof response.body.config.signing.anomalies.threshold_breaches, "object");
  assert.equal(typeof response.body.config.signing.thresholds, "object");
  assert.equal(typeof response.body.config.signing.key_usage.agent_descriptors_by_key_id, "object");
  assert.equal(typeof response.body.config.signing.key_usage.receipts_by_key_id, "object");
  assert.equal(typeof response.body.config.signing.key_usage.audit_checkpoints_by_key_id, "object");
  assert.equal(response.body.config.stores.task_store_configured, true);
  assert.equal(response.body.config.stores.dead_letter_store_configured, true);
  assert.equal(response.body.config.stores.metrics_store_configured, true);
  assert.equal(typeof response.body.runtime.node_version, "string");
  assert.equal(typeof response.body.runtime.uptime_s, "number");
});

test("server status uses safe defaults when config is omitted", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/status");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.config.enforce_signed_requests, false);
  assert.equal(response.body.config.require_tenant, false);
  assert.equal(response.body.config.health_thresholds.dead_letter_count, null);
  assert.equal(response.body.config.health_thresholds.oldest_dead_letter_age_ms, null);
  assert.equal(response.body.config.metrics.failure_rate_threshold, null);
  assert.equal(response.body.config.rate_limits.max_requests_global, null);
  assert.equal(response.body.config.rate_limits.max_requests_per_tenant, null);
  assert.equal(response.body.config.audit.store_configured, false);
  assert.equal(response.body.config.audit.checkpoint_interval, 100);
  assert.equal(Array.isArray(response.body.config.signing.verification_keys), true);
  assert.equal(typeof response.body.config.signing.key_usage, "object");
  assert.equal(typeof response.body.config.signing.key_provider.provider, "string");
  assert.equal(typeof response.body.config.signing.key_provider.configured, "boolean");
  assert.equal(typeof response.body.config.signing.anomalies, "object");
  assert.equal(response.body.config.signing.anomalies.severity, "ok");
  assert.equal(
    response.body.config.signing.anomalies.recommended_action,
    "No action required."
  );
  assert.equal(response.body.config.signing.thresholds.unknown_key_critical_ratio, 0);
  assert.equal(response.body.config.signing.thresholds.retiring_key_critical_ratio, 0.2);
});

test("server status escalates retiring key anomaly to critical when ratio exceeds threshold", async () => {
  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "kid_retiring", secret: "retiring_secret", status: "retiring", demo_only: false }
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_retiring"
    },
    async () => {
      const dispatch = createDispatcher({
        signingRetiringKeyCriticalRatio: 0.1
      });
      await dispatch("POST", "/dispatch", {
        capability: "db.read.query",
        envelope: {
          task_id: "task_retiring_ratio_threshold",
          requester_identity: { type: "user", id: "threshold_user" },
          target_agent: "dbread-agent-v1",
          intent: "Create receipt with retiring signing key",
          constraints: {
            common: { environment: "staging", redaction_level: "basic" },
            domain: { dataset: "incident_metrics", service: "payments" }
          },
          risk_class: "medium",
          delegation_token: "placeholder",
          requested_output_mode: "summary"
        }
      });
      const response = await dispatch("GET", "/status");
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.config.signing.anomalies.retiring_key_usage_detected, true);
      assert.equal(
        response.body.config.signing.anomalies.threshold_breaches.retiring_key_ratio_exceeded,
        true
      );
      assert.equal(response.body.config.signing.anomalies.severity, "critical");
    }
  );
});

test("server rate limits mutating requests by global threshold", async () => {
  const dispatch = createDispatcher({
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 1
  });

  const first = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_rate_global_1",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Read staging incident details",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  assert.equal(first.statusCode, 200);

  const second = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_rate_global_2",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Read staging incident details again",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(second.statusCode, 429);
  assert.equal(second.body.error.code, "rate_limited");
  assert.equal(second.body.error.retryable, true);
  assert.equal(second.body.error.details.scope, "global");
  assert.equal(second.body.error.details.category, "throttling");
  assert.equal(second.body.error.details.retry_after_ms > 0, true);
});

test("server rate limits mutating requests per tenant without affecting other tenants", async () => {
  const dispatch = createDispatcher({
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 10,
    rateLimitMaxRequestsPerTenant: 1
  });

  const tenantA1 = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_rate_tenant_a_1",
      requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
      target_agent: "dbread-agent-v1",
      intent: "Tenant A first request",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  assert.equal(tenantA1.statusCode, 200);

  const tenantA2 = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_rate_tenant_a_2",
      requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
      target_agent: "dbread-agent-v1",
      intent: "Tenant A second request",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  assert.equal(tenantA2.statusCode, 429);
  assert.equal(tenantA2.body.error.code, "rate_limited");
  assert.equal(tenantA2.body.error.details.scope, "tenant");

  const tenantB1 = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_rate_tenant_b_1",
      requester_identity: { type: "user", id: "engineer_2", tenant_id: "tenant_B" },
      target_agent: "dbread-agent-v1",
      intent: "Tenant B first request",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  assert.equal(tenantB1.statusCode, 200);
});

test("server records audit events for auth and rate-limit failures", async () => {
  const dispatch = createDispatcher({
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 1
  });

  const authFailure = await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_audit_auth_failure",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Trigger auth failure",
      constraints: {
        common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
        domain: { invoice_id: "INV-223", approved_vendor_only: true }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  assert.equal(authFailure.statusCode, 401);

  const rateLimited = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_audit_rate_limited",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Trigger rate limit",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });
  assert.equal(rateLimited.statusCode, 429);

  const events = await dispatch("GET", "/audit-events");
  assert.equal(events.statusCode, 200);
  assert.equal(Array.isArray(events.body.events), true);
  assert.equal(Array.isArray(events.body.checkpoints), true);
  assert.equal(events.body.events.some((e: { code: string }) => e.code === "auth_required"), true);
  assert.equal(events.body.events.some((e: { code: string }) => e.code === "rate_limited"), true);
});

test("server audit events are hash-chained and checkpoints are signed", async () => {
  const dispatch = createDispatcher({
    auditCheckpointInterval: 2,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 1
  });

  await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_audit_chain_1",
      requester_identity: { type: "user", id: "user_1" },
      target_agent: "payment-agent-v1",
      intent: "Trigger auth failure 1",
      constraints: {
        common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
        domain: { invoice_id: "INV-1", approved_vendor_only: true }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_audit_chain_2",
      requester_identity: { type: "user", id: "user_1" },
      target_agent: "dbread-agent-v1",
      intent: "Trigger rate limit 2",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const audit = await dispatch("GET", "/audit-events");
  assert.equal(audit.statusCode, 200);
  assert.equal(audit.body.events.length >= 2, true);

  const events = audit.body.events as Array<{
    chain_index: number;
    prev_event_hash: string;
    event_hash: string;
  }>;
  for (let index = 1; index < events.length; index += 1) {
    assert.equal(events[index].chain_index, events[index - 1].chain_index + 1);
    assert.equal(events[index].prev_event_hash, events[index - 1].event_hash);
  }

  const checkpoints = audit.body.checkpoints as Array<{
    checkpoint_id: string;
    created_at: string;
    last_chain_index: number;
    last_event_hash: string;
    key_id: string;
    signature: string;
  }>;
  assert.equal(checkpoints.length >= 1, true);
  const latest = checkpoints[checkpoints.length - 1];
  assert.equal(latest.key_id, getSignatureKeyId(latest.signature));
  assert.equal(
    verifyAuditCheckpointSignature(
      {
        checkpoint_id: latest.checkpoint_id,
        created_at: latest.created_at,
        last_chain_index: latest.last_chain_index,
        last_event_hash: latest.last_event_hash
      },
      latest.signature
    ),
    true
  );
});

test("server audit verify endpoint reports success on intact chain", async () => {
  const dispatch = createDispatcher({
    auditCheckpointInterval: 1,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 1
  });

  await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_audit_verify_ok_1",
      requester_identity: { type: "user", id: "user_1" },
      target_agent: "payment-agent-v1",
      intent: "Trigger auth failure",
      constraints: {
        common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
        domain: { invoice_id: "INV-1", approved_vendor_only: true }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const verify = await dispatch("GET", "/audit-events/verify");
  assert.equal(verify.statusCode, 200);
  assert.equal(verify.body.verification.ok, true);
  assert.equal(Array.isArray(verify.body.verification.errors), true);
  assert.equal(verify.body.verification.errors.length, 0);
});

test("server audit verify endpoint reports failure on tampered audit store", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-audit-verify-"));
  const auditStorePath = join(tempDir, "audit-events.json");
  try {
    const dispatch = createDispatcher({
      auditStorePath,
      auditCheckpointInterval: 1,
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 1
    });

    await dispatch("POST", "/dispatch", {
      capability: "payment.execute",
      envelope: {
        task_id: "task_audit_verify_bad_1",
        requester_identity: { type: "user", id: "user_2" },
        target_agent: "payment-agent-v1",
        intent: "Trigger auth failure",
        constraints: {
          common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
          domain: { invoice_id: "INV-2", approved_vendor_only: true }
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      }
    });

    const stored = JSON.parse(readFileSync(auditStorePath, "utf8")) as {
      events: Array<{ event_hash: string }>;
      checkpoints: Array<{ signature: string }>;
    };
    stored.events[0].event_hash = "tampered_hash";
    writeFileSync(auditStorePath, JSON.stringify(stored, null, 2), "utf8");

    const dispatchAfterTamper = createDispatcher({ auditStorePath });
    const verify = await dispatchAfterTamper("GET", "/audit-events/verify");
    assert.equal(verify.statusCode, 500);
    assert.equal(verify.body.verification.ok, false);
    assert.equal(verify.body.verification.errors.length >= 1, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server audit export provides signed snapshot metadata", async () => {
  const dispatch = createDispatcher({
    auditCheckpointInterval: 1,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 1
  });

  await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_audit_export_1",
      requester_identity: { type: "user", id: "user_export" },
      target_agent: "payment-agent-v1",
      intent: "Trigger auth failure for export",
      constraints: {
        common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
        domain: { invoice_id: "INV-E1", approved_vendor_only: true }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const exported = await dispatch("GET", "/audit-events/export");
  assert.equal(exported.statusCode, 200);
  assert.equal(Array.isArray(exported.body.events), true);
  assert.equal(Array.isArray(exported.body.checkpoints), true);
  assert.equal(typeof exported.body.export.signature, "string");
  assert.equal(typeof exported.body.export.key_id, "string");
  assert.equal(exported.body.export.key_id, getSignatureKeyId(exported.body.export.signature));
  assert.equal(
    verifyAuditExportSignature(
      {
        export_id: exported.body.export.export_id,
        created_at: exported.body.export.created_at,
        events_count: exported.body.export.events_count,
        checkpoints_count: exported.body.export.checkpoints_count,
        latest_chain_index: exported.body.export.latest_chain_index,
        latest_event_hash: exported.body.export.latest_event_hash
      },
      exported.body.export.signature
    ),
    true
  );
});

test("server conformance export provides signed readiness artifact", async () => {
  const dispatch = createDispatcher();
  const exported = await dispatch("GET", "/conformance/export");
  assert.equal(exported.statusCode, 200);
  assert.equal(typeof exported.body.conformance.signature, "string");
  assert.equal(typeof exported.body.conformance.key_id, "string");
  assert.equal(Array.isArray(exported.body.artifact.checks), true);
  assert.equal(exported.body.conformance.key_id, getSignatureKeyId(exported.body.conformance.signature));
  assert.equal(
    verifyConformanceExportSignature(
      {
        export_id: exported.body.conformance.export_id,
        created_at: exported.body.conformance.created_at,
        profile: exported.body.conformance.profile,
        total_checks: exported.body.conformance.total_checks,
        passed_checks: exported.body.conformance.passed_checks,
        failed_checks: exported.body.conformance.failed_checks,
        artifact_hash: exported.body.conformance.artifact_hash
      },
      exported.body.conformance.signature
    ),
    true
  );
});

test("server trust bundle export provides signed trust metadata and keys", async () => {
  const dispatch = createDispatcher({
    deploymentProfile: "verified"
  });
  const exported = await dispatch("GET", "/trust-bundle/export");
  assert.equal(exported.statusCode, 200);
  assert.equal(Array.isArray(exported.body.keys), true);
  assert.equal(typeof exported.body.trust_bundle.signature, "string");
  assert.equal(
    exported.body.trust_bundle.key_id,
    getSignatureKeyId(exported.body.trust_bundle.signature)
  );
  assert.equal(
    verifyTrustBundleSignature(
      {
        bundle_id: exported.body.trust_bundle.bundle_id,
        created_at: exported.body.trust_bundle.created_at,
        trust_domain: exported.body.trust_bundle.trust_domain,
        issuer: exported.body.trust_bundle.issuer,
        profile: exported.body.trust_bundle.profile,
        keys_hash: exported.body.trust_bundle.keys_hash
      },
      exported.body.trust_bundle.signature
    ),
    true
  );
});

test("server status reports signing key usage for receipts and checkpoints", async () => {
  const dispatch = createDispatcher({
    auditCheckpointInterval: 1,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 10
  });

  await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_status_signing_usage_receipt",
      requester_identity: { type: "user", id: "usage_user" },
      target_agent: "dbread-agent-v1",
      intent: "Generate receipt for signing usage counts",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_status_signing_usage_audit",
      requester_identity: { type: "user", id: "usage_user_2" },
      target_agent: "payment-agent-v1",
      intent: "Generate auth failure audit event",
      constraints: {
        common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
        domain: { invoice_id: "INV-usage", approved_vendor_only: true }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const status = await dispatch("GET", "/status");
  assert.equal(status.statusCode, 200);
  const usage = status.body.config.signing.key_usage;
  assert.equal(
    Object.values(usage.agent_descriptors_by_key_id).reduce(
      (acc: number, value: unknown) => acc + Number(value),
      0
    ) >= 2,
    true
  );
  assert.equal(
    Object.values(usage.receipts_by_key_id).reduce(
      (acc: number, value: unknown) => acc + Number(value),
      0
    ) >= 1,
    true
  );
  assert.equal(
    Object.values(usage.audit_checkpoints_by_key_id).reduce(
      (acc: number, value: unknown) => acc + Number(value),
      0
    ) >= 1,
    true
  );
});

test("server filters audit events by tenant_id", async () => {
  const dispatch = createDispatcher({
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequestsPerTenant: 1,
    rateLimitMaxRequests: 10
  });

  await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_audit_tenant_a_1",
      requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
      target_agent: "dbread-agent-v1",
      intent: "Tenant A baseline request",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_audit_tenant_a_2",
      requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
      target_agent: "dbread-agent-v1",
      intent: "Tenant A rate-limited request",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_audit_tenant_b_1",
      requester_identity: { type: "user", id: "engineer_b", tenant_id: "tenant_B" },
      target_agent: "dbread-agent-v1",
      intent: "Tenant B baseline request",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const tenantAEvents = await dispatch("GET", "/audit-events?tenant_id=tenant_A");
  assert.equal(tenantAEvents.statusCode, 200);
  assert.equal(
    tenantAEvents.body.events.some(
      (event: { code: string; tenant_id?: string }) =>
        event.code === "rate_limited" && event.tenant_id === "tenant_A"
    ),
    true
  );
  assert.equal(
    tenantAEvents.body.events.some(
      (event: { tenant_id?: string }) => event.tenant_id === "tenant_B"
    ),
    false
  );
});

test("server audit events endpoint supports pagination and etag conditional requests", async () => {
  const dispatch = createDispatcher();

  for (const taskId of ["task_audit_page_1", "task_audit_page_2", "task_audit_page_3"]) {
    await dispatch("POST", "/dispatch", {
      capability: "payment.execute",
      envelope: {
        task_id: taskId,
        requester_identity: { type: "user", id: "audit_pager" },
        target_agent: "payment-agent-v1",
        intent: "Generate audit auth failure",
        constraints: {
          common: { resource_id: "vendor_abc", currency: "INR", max_amount: 450 },
          domain: { invoice_id: "INV-pager", approved_vendor_only: true }
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      }
    });
  }

  const page1 = await dispatch("GET", "/audit-events?limit=1");
  assert.equal(page1.statusCode, 200);
  assert.equal(Array.isArray(page1.body.events), true);
  assert.equal(page1.body.events.length, 1);
  assert.equal(typeof page1.body.pagination.next_cursor, "number");
  assert.equal(typeof page1.headers.etag, "string");

  const page2 = await dispatch(
    "GET",
    `/audit-events?limit=1&cursor=${encodeURIComponent(String(page1.body.pagination.next_cursor))}`
  );
  assert.equal(page2.statusCode, 200);
  assert.equal(page2.body.events.length, 1);

  const notModified = await dispatch("GET", "/audit-events?limit=1", undefined, {
    "if-none-match": page1.headers.etag
  });
  assert.equal(notModified.statusCode, 304);
});

test("server exposes dead-letter endpoint", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/dead-letters");

  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.body.dead_letters), true);
});

test("server dead-letter endpoint supports pagination and etag conditional requests", async () => {
  const dispatch = createDispatcher();
  const page = await dispatch("GET", "/dead-letters?limit=1");
  assert.equal(page.statusCode, 200);
  assert.equal(Array.isArray(page.body.dead_letters), true);
  assert.equal(typeof page.body.pagination.limit, "number");
  assert.equal(typeof page.headers.etag, "string");

  const notModified = await dispatch("GET", "/dead-letters?limit=1", undefined, {
    "if-none-match": page.headers.etag
  });
  assert.equal(notModified.statusCode, 304);
});

test("server exposes alerts endpoint", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/alerts");

  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.body.alerts), true);
});

test("server alerts endpoint supports pagination and etag conditional requests", async () => {
  const dispatch = createDispatcher();

  const page = await dispatch("GET", "/alerts?limit=1");
  assert.equal(page.statusCode, 200);
  assert.equal(Array.isArray(page.body.alerts), true);
  assert.equal(typeof page.body.pagination.limit, "number");
  assert.equal(typeof page.headers.etag, "string");

  const notModified = await dispatch("GET", "/alerts?limit=1", undefined, {
    "if-none-match": page.headers.etag
  });
  assert.equal(notModified.statusCode, 304);
});

test("server alerts include lifecycle fields and persist first_seen across restart", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-alerts-store-"));
  const metricsStorePath = join(tempDir, "metrics.json");
  const alertStorePath = join(tempDir, "alerts.json");

  try {
    const dispatchA = createDispatcher({
      metricsStorePath,
      alertStorePath,
      metricsWindowMs: 60_000,
      metricsFailureRateThreshold: 0
    });

    await dispatchA("POST", "/dispatch", {
      capability: "",
      envelope: {}
    });
    const alertsA = await dispatchA("GET", "/alerts");
    assert.equal(alertsA.statusCode, 200);
    const failureRateAlertA = alertsA.body.alerts.find(
      (alert: { code: string }) => alert.code === "request_failure_rate_exceeded"
    );
    assert.equal(typeof failureRateAlertA, "object");
    assert.equal(typeof failureRateAlertA.first_seen, "string");
    assert.equal(typeof failureRateAlertA.last_seen, "string");

    const dispatchB = createDispatcher({
      metricsStorePath,
      alertStorePath,
      metricsWindowMs: 60_000,
      metricsFailureRateThreshold: 0
    });
    const alertsB = await dispatchB("GET", "/alerts");
    assert.equal(alertsB.statusCode, 200);
    const failureRateAlertB = alertsB.body.alerts.find(
      (alert: { code: string }) => alert.code === "request_failure_rate_exceeded"
    );
    assert.equal(typeof failureRateAlertB, "object");
    assert.equal(failureRateAlertB.first_seen, failureRateAlertA.first_seen);
    assert.equal(Date.parse(failureRateAlertB.last_seen) >= Date.parse(failureRateAlertA.last_seen), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server filters alerts by tenant_id", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-alerts-tenant-"));
  const receiptStorePath = join(tempDir, "receipts.json");

  try {
    writeFileSync(
      receiptStorePath,
      JSON.stringify(
        {
          receipts: [
            {
              receipt_id: "receipt:task_alert_tenant_a",
              task_id: "task_alert_tenant_a",
              tenant_id: "tenant_A",
              agent_id: "dbread-agent-v1",
              action_taken: "query",
              resource_touched: "incident_metrics",
              policy_checks: [],
              timestamp: new Date().toISOString(),
              result_hash: "hash",
              signature: "bad-signature"
            }
          ]
        },
        null,
        2
      )
    );

    const dispatch = createDispatcher({ receiptStorePath });
    const tenantAAlerts = await dispatch("GET", "/alerts?tenant_id=tenant_A");
    assert.equal(tenantAAlerts.statusCode, 200);
    assert.equal(
      tenantAAlerts.body.alerts.some(
        (alert: { code: string; tenant_id?: string }) =>
          alert.code === "unknown_key_usage_detected" && alert.tenant_id === "tenant_A"
      ),
      true
    );

    const tenantBAlerts = await dispatch("GET", "/alerts?tenant_id=tenant_B");
    assert.equal(tenantBAlerts.statusCode, 200);
    assert.equal(
      tenantBAlerts.body.alerts.some(
        (alert: { tenant_id?: string }) => alert.tenant_id === "tenant_A"
      ),
      false
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server can acknowledge active alert", async () => {
  const dispatch = createDispatcher({
    metricsWindowMs: 60_000,
    metricsFailureRateThreshold: 0
  });

  await dispatch("POST", "/dispatch", {
    capability: "",
    envelope: {}
  });

  const alerts = await dispatch("GET", "/alerts");
  assert.equal(alerts.statusCode, 200);
  const failureAlert = alerts.body.alerts.find(
    (alert: { code: string }) => alert.code === "request_failure_rate_exceeded"
  );
  assert.equal(typeof failureAlert, "object");

  const ack = await dispatch("POST", `/alerts/${encodeURIComponent(failureAlert.id)}/ack`, {
    actor: "ops_user_1"
  });
  assert.equal(ack.statusCode, 200);
  assert.equal(ack.body.alert.id, failureAlert.id);
  assert.equal(typeof ack.body.alert.acknowledged_at, "string");
  assert.equal(ack.body.alert.acknowledged_by, "ops_user_1");
});

test("server can suppress active alert by duration", async () => {
  const dispatch = createDispatcher({
    metricsWindowMs: 60_000,
    metricsFailureRateThreshold: 0
  });

  await dispatch("POST", "/dispatch", {
    capability: "",
    envelope: {}
  });

  const alerts = await dispatch("GET", "/alerts");
  assert.equal(alerts.statusCode, 200);
  const failureAlert = alerts.body.alerts.find(
    (alert: { code: string }) => alert.code === "request_failure_rate_exceeded"
  );
  assert.equal(typeof failureAlert, "object");

  const suppress = await dispatch(
    "POST",
    `/alerts/${encodeURIComponent(failureAlert.id)}/suppress`,
    { actor: "ops_user_2", duration_seconds: 3600 }
  );
  assert.equal(suppress.statusCode, 200);
  assert.equal(suppress.body.alert.id, failureAlert.id);
  assert.equal(typeof suppress.body.alert.suppressed_until, "string");
  assert.equal(suppress.body.alert.suppressed_by, "ops_user_2");

  const alertsAfterSuppress = await dispatch("GET", "/alerts");
  assert.equal(alertsAfterSuppress.statusCode, 200);
  assert.equal(
    alertsAfterSuppress.body.alerts.some((alert: { id: string }) => alert.id === failureAlert.id),
    false
  );
});

test("server rejects alert ack and suppress for unknown id", async () => {
  const dispatch = createDispatcher();

  const ack = await dispatch("POST", "/alerts/alert%3Aunknown/ack", { actor: "ops_user_3" });
  assert.equal(ack.statusCode, 404);
  assert.equal(ack.body.error.code, "alert_not_found");

  const suppress = await dispatch("POST", "/alerts/alert%3Aunknown/suppress", {
    actor: "ops_user_3",
    duration_seconds: 60
  });
  assert.equal(suppress.statusCode, 404);
  assert.equal(suppress.body.error.code, "alert_not_found");
});

test("server exposes metrics endpoint", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/metrics");

  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.body.metrics, "object");
  assert.equal(typeof response.body.metrics.queue.queue_depth, "number");
  assert.equal(typeof response.body.metrics.queue.dead_letter_count, "number");
  assert.equal(typeof response.body.metrics.tasks.total, "number");
  assert.equal(typeof response.body.metrics.tasks.by_status, "object");
  assert.equal(typeof response.body.metrics.tasks.by_capability, "object");
  assert.equal(typeof response.body.metrics.tasks.by_agent, "object");
  assert.equal(typeof response.body.metrics.requests.total, "number");
  assert.equal(typeof response.body.metrics.requests.failure_rate_window, "number");
  assert.equal(typeof response.body.metrics.errors.by_code, "object");
  assert.equal(typeof response.body.metrics.errors.by_agent, "object");
  assert.equal(typeof response.body.metrics.errors.by_agent_by_code, "object");
  assert.equal(typeof response.body.metrics.signing.key_usage, "object");
  assert.equal(typeof response.body.metrics.signing.anomalies, "object");
  assert.equal(
    typeof response.body.metrics.signing.key_usage.agent_descriptors_by_key_id,
    "object"
  );
  assert.equal(typeof response.body.metrics.signing.key_usage.receipts_by_key_id, "object");
  assert.equal(
    typeof response.body.metrics.signing.key_usage.audit_checkpoints_by_key_id,
    "object"
  );
  assert.equal(
    typeof response.body.metrics.signing.anomalies.unknown_key_usage_detected,
    "boolean"
  );
  assert.equal(
    typeof response.body.metrics.signing.anomalies.retiring_key_usage_detected,
    "boolean"
  );
  assert.equal(typeof response.body.metrics.signing.anomalies.severity, "string");
  assert.equal(typeof response.body.metrics.signing.anomalies.recommended_action, "string");
  assert.equal(typeof response.body.metrics.signing.anomalies.unknown_key_usage_ratio, "number");
  assert.equal(typeof response.body.metrics.signing.anomalies.retiring_key_usage_ratio, "number");
  assert.equal(typeof response.body.metrics.signing.anomalies.total_signatures_analyzed, "number");
  assert.equal(typeof response.body.metrics.signing.anomalies.thresholds, "object");
  assert.equal(typeof response.body.metrics.signing.anomalies.threshold_breaches, "object");
  assert.equal(typeof response.body.metrics.latencies.by_capability, "object");
  assert.equal(typeof response.body.metrics.alerts.thresholds, "object");
  assert.equal(typeof response.body.metrics.alerts.breaches, "object");
});

test("server metrics signing anomalies detect unknown key usage", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-signing-anomaly-"));
  const receiptStorePath = join(tempDir, "receipts.json");
  try {
    writeFileSync(
      receiptStorePath,
      JSON.stringify(
        {
          receipts: [
            {
              receipt_id: "receipt:task_unknown_signature",
              task_id: "task_unknown_signature",
              tenant_id: "tenant_A",
              agent_id: "dbread-agent-v1",
              action_taken: "query",
              resource_touched: "incident_metrics",
              policy_checks: [],
              timestamp: new Date().toISOString(),
              result_hash: "x",
              signature: "bad-signature"
            }
          ]
        },
        null,
        2
      )
    );

    const dispatch = createDispatcher({ receiptStorePath });
    const response = await dispatch("GET", "/metrics");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.metrics.signing.anomalies.unknown_key_usage_detected, true);
    assert.equal(response.body.metrics.signing.anomalies.severity, "critical");
    assert.equal(
      response.body.metrics.signing.anomalies.recommended_action.includes(
        "Investigate unknown signing key usage immediately"
      ),
      true
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server metrics track error counters and rolling failure rate", async () => {
  const dispatch = createDispatcher({ metricsWindowMs: 60_000 });
  await dispatch("POST", "/dispatch", {
    capability: "",
    envelope: {}
  });

  const metrics = await dispatch("GET", "/metrics");
  assert.equal(metrics.statusCode, 200);
  assert.equal(
    (metrics.body.metrics.errors.by_code.invalid_request ?? 0) >= 1,
    true
  );
  assert.equal(metrics.body.metrics.requests.window_failed >= 1, true);
  assert.equal(metrics.body.metrics.requests.failure_rate_window > 0, true);
});

test("server metrics track per-agent error counters", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_metrics_per_agent_error",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Attempt payment without auth headers",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const metrics = await dispatch("GET", "/metrics");
  assert.equal(metrics.statusCode, 200);
  assert.equal((metrics.body.metrics.errors.by_agent["payment-agent-v1"] ?? 0) >= 1, true);
  assert.equal(
    (metrics.body.metrics.errors.by_agent_by_code["payment-agent-v1"]?.auth_required ?? 0) >= 1,
    true
  );
});

test("server metrics expose alert thresholds and breach state", async () => {
  const dispatch = createDispatcher({
    metricsFailureRateThreshold: 0,
    healthMaxDeadLetters: 10
  });
  await dispatch("POST", "/dispatch", {
    capability: "",
    envelope: {}
  });

  const metrics = await dispatch("GET", "/metrics");
  assert.equal(metrics.statusCode, 200);
  assert.equal(metrics.body.metrics.alerts.thresholds.request_failure_rate_window, 0);
  assert.equal(metrics.body.metrics.alerts.thresholds.dead_letter_count, 10);
  assert.equal(metrics.body.metrics.alerts.breaches.request_failure_rate_exceeded, true);
  assert.equal(metrics.body.metrics.alerts.breaches.dead_letter_count_exceeded, false);
});

test("server persists metrics counters when metrics store path is configured", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-metrics-store-"));
  const metricsStorePath = join(tempDir, "metrics.json");

  try {
    const dispatchA = createDispatcher({ metricsStorePath, metricsWindowMs: 60_000 });
    await dispatchA("POST", "/dispatch", {
      capability: "",
      envelope: {}
    });

    const dispatchB = createDispatcher({ metricsStorePath, metricsWindowMs: 60_000 });
    const metrics = await dispatchB("GET", "/metrics");

    assert.equal(metrics.statusCode, 200);
    assert.equal(metrics.body.metrics.requests.total >= 1, true);
    assert.equal((metrics.body.metrics.errors.by_code.invalid_request ?? 0) >= 1, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server metrics include per-capability latency stats", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_latency_capability_metrics",
      requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
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

  const metrics = await dispatch("GET", "/metrics");
  assert.equal(metrics.statusCode, 200);
  const latency = metrics.body.metrics.latencies.by_capability["db.read.aggregate"];
  assert.equal(typeof latency, "object");
  assert.equal(latency.count >= 1, true);
  assert.equal(typeof latency.avg_ms, "number");
  assert.equal(typeof latency.p50_ms, "number");
  assert.equal(typeof latency.p95_ms, "number");
});

test("server returns verifiable signed descriptors", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/agents?capability=payment.execute");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.agents.length, 1);
  assert.equal(verifyAgentDescriptorSignature(response.body.agents[0]), true);
});

test("server filters agents by domain", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/agents?domain=database");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.agents.length, 1);
  assert.equal(response.body.agents[0].agent_id, "dbread-agent-v1");
});

test("server exposes capability descriptors in discovery output", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("GET", "/agents?capability=payment.execute");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.agents.length, 1);
  assert.ok(Array.isArray(response.body.agents[0].capability_descriptors));
  assert.equal(
    response.body.agents[0].capability_descriptors.some(
      (descriptor: { name: string }) => descriptor.name === "payment.execute"
    ),
    true
  );
  const paymentExecute = response.body.agents[0].capability_descriptors.find(
    (descriptor: { name: string }) => descriptor.name === "payment.execute"
  );
  assert.equal(paymentExecute.schema_version, "1.1.0");
  assert.equal(paymentExecute.preferred_schema_version, "1.1.0");
  assert.deepEqual(paymentExecute.auth_schemes, ["signed_request"]);
  assert.equal(paymentExecute.required_auth_scheme, "signed_request");
});

test("server allows capability without required auth to dispatch anonymously", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("POST", "/dispatch", {
    capability: "db.read.query",
    envelope: {
      task_id: "task_db_query_noauth",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Read staging incident details",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.status, "completed");
});

test("server enforces required capability auth for payment.execute", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_payment_auth_required",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Pay approved merchant for order ORD-223",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error.code, "auth_required");
  assert.equal(response.body.error.retryable, false);
});

test("server rejects capability when target agent does not support it", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("POST", "/dispatch", {
    capability: "payment.execute",
    envelope: {
      task_id: "task_capability_mismatch_http",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "dbread-agent-v1",
      intent: "Attempt payment against database agent",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "capability_not_supported");
});

test("server rejects unsupported requested schema version", async () => {
  const dispatch = createDispatcher();
  const body = {
    capability: "payment.execute",
    requested_schema_version: "9.9.9",
    envelope: {
      task_id: "task_http_schema_bad",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Pay approved merchant for order ORD-223",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };

  const headers = signHttpRequest({
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "map-dev-key-1",
    body: JSON.stringify(body)
  });

  const response = await dispatch("POST", "/dispatch", body, { ...headers });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "unsupported_schema_version");
});

test("server returns requested and executed schema versions when provider translates", async () => {
  const dispatch = createDispatcher();
  const body = {
    capability: "payment.execute",
    requested_schema_version: "1.0.0",
    envelope: {
      task_id: "task_http_schema_translated",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Pay approved merchant for order ORD-223",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };

  const headers = signHttpRequest({
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "map-dev-key-1",
    body: JSON.stringify(body)
  });

  const response = await dispatch("POST", "/dispatch", body, { ...headers });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.requested_schema_version, "1.0.0");
  assert.equal(response.body.result.executed_schema_version, "1.1.0");
  assert.equal(response.body.receipt.requested_schema_version, "1.0.0");
  assert.equal(response.body.receipt.executed_schema_version, "1.1.0");
  assert.deepEqual(response.body.result.negotiation, {
    requested: {
      schema_version: "1.0.0",
      output_mode: "summary",
      delivery_mode: "sync"
    },
    selected: {
      schema_version: "1.1.0",
      output_mode: "summary",
      delivery_mode: "sync"
    },
    provider_actions: ["schema_translated"]
  });
});

test("server accepts negotiated async delivery mode", async () => {
  const dispatch = createDispatcher();
  const body = {
    capability: "db.read.aggregate",
    negotiation: {
      delivery_mode: "async"
    },
    envelope: {
      task_id: "task_http_negotiated_async",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };

  const response = await dispatch("POST", "/dispatch", body);
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.result.status, "running");
  assert.equal(response.body.result.negotiation.requested.delivery_mode, "async");
  assert.equal(response.body.result.negotiation.selected.delivery_mode, "async");
});

test("server rejects unsupported output mode for target agent", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_http_output_mode_bad",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "debug"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "unsupported_output_mode");
});

test("server returns 202 for approval-required task", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_db_prod",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.result.status, "awaiting_approval");
});

test("server resumes approval-gated task through /approve", async () => {
  const dispatch = createDispatcher();
  const paused = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_db_resume_http",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const response = await dispatch("POST", "/approve", {
    task_id: "task_db_resume_http",
    approval_reference: paused.body.result.structured_output.approval_reference,
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_db_resume_http",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.status, "completed");
});

test("server rejects direct /approve without pending approval state", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch("POST", "/approve", {
    task_id: "task_direct_approve_reject_http",
    approval_reference: "approval:task_direct_approve_reject_http",
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_direct_approve_reject_http",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Direct approve",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "task_not_found");
});

test("server returns persisted task state", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_db_state",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const response = await dispatch("GET", "/tasks/task_db_state");
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.task.task_id, "task_db_state");
  assert.equal(response.body.task.status, "completed");
});

test("server returns running for async task and later exposes completed state", async () => {
  const dispatch = createDispatcher();
  const taskId = "task_async_http";

  const accepted = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: taskId,
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary asynchronously",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
      metadata: {
        async: true
      }
    }
  });

  assert.equal(accepted.statusCode, 202);
  assert.equal(accepted.body.result.status, "running");

  await delay(0);
  const current = await dispatch("GET", `/tasks/${taskId}`);
  assert.equal(current.statusCode, 200);
  assert.equal(current.body.task.status, "completed");
});

test("server accepts valid signed_request auth when provided", async () => {
  const dispatch = createDispatcher();
  const body = {
    capability: "payment.execute",
    envelope: {
      task_id: "task_signed_ok",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Pay approved merchant for order ORD-223",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };

  const headers = signHttpRequest({
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "map-dev-key-1",
    body: JSON.stringify(body)
  });

  const response = await dispatch("POST", "/dispatch", body, { ...headers });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.status, "completed");
});

test("server rejects invalid signed_request auth", async () => {
  const dispatch = createDispatcher();
  const body = {
    capability: "payment.execute",
    envelope: {
      task_id: "task_signed_bad",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Pay approved merchant for order ORD-223",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };

  const headers = signHttpRequest({
    method: "POST",
    path: "/dispatch",
    timestamp: new Date().toISOString(),
    key_id: "map-dev-key-1",
    body: JSON.stringify(body)
  });
  headers["x-map-request-signature"] = `${headers["x-map-request-signature"]}tampered`;

  const response = await dispatch("POST", "/dispatch", body, { ...headers });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, "invalid_auth");
});

test("server rejects signed_request auth from revoked key", async () => {
  const body = {
    capability: "payment.execute",
    envelope: {
      task_id: "task_signed_revoked",
      requester_identity: { type: "user", id: "user_42" },
      target_agent: "payment-agent-v1",
      intent: "Pay approved merchant for order ORD-223",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true
        }
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };

  let headers: ReturnType<typeof signHttpRequest> | undefined;
  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "kid_old", secret: "old_secret", status: "retiring", demo_only: false },
        { kid: "kid_new", secret: "new_secret", status: "active", demo_only: false }
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_new",
      MAP_SIGNING_REVOKED_KIDS: undefined
    },
    async () => {
      headers = signHttpRequest({
        method: "POST",
        path: "/dispatch",
        timestamp: new Date().toISOString(),
        key_id: "kid_old",
        body: JSON.stringify(body)
      });
    }
  );

  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "kid_old", secret: "old_secret", status: "retiring", demo_only: false },
        { kid: "kid_new", secret: "new_secret", status: "active", demo_only: false }
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_new",
      MAP_SIGNING_REVOKED_KIDS: "kid_old"
    },
    async () => {
      const dispatch = createDispatcher();
      const response = await dispatch("POST", "/dispatch", body, { ...(headers ?? {}) });
      assert.equal(response.statusCode, 403);
      assert.equal(response.body.error.code, "invalid_auth");
    }
  );
});

test("server requires auth when signed requests are enforced", async () => {
  const dispatch = createDispatcher({ enforceSignedRequests: true });
  const response = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_auth_required",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error.code, "auth_required");
});

test("server admin controls can disable and re-enable an agent", async () => {
  await withEnv(
    {
      MAP_ADMIN_TOKEN: "admin-secret",
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "map-dev-key-1", secret: "map-dev-secret", status: "active", demo_only: true },
        { kid: "map-dev-key-2", secret: "map-dev-secret-2", status: "active", demo_only: true }
      ]),
      MAP_SIGNING_ACTIVE_KID: "map-dev-key-2"
    },
    async () => {
      const dispatch = createDispatcher();
      const disableBody = { actor: "secops", reason: "incident_response" };
      const disableHeaders = signHttpRequest({
        method: "POST",
        path: "/admin/agents/dbread-agent-v1/disable",
        timestamp: new Date().toISOString(),
        key_id: "map-dev-key-1",
        body: JSON.stringify(disableBody)
      });
      const disabled = await dispatch(
        "POST",
        "/admin/agents/dbread-agent-v1/disable",
        disableBody,
        { ...disableHeaders, "x-map-admin-token": "admin-secret" }
      );
      assert.equal(disabled.statusCode, 200);

      const blocked = await dispatch("POST", "/dispatch", {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "task_admin_disabled_agent",
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
      assert.equal(blocked.statusCode, 403);
      assert.equal(blocked.body.error.code, "agent_disabled");

      const enableBody = { actor: "secops" };
      const enableHeaders = signHttpRequest({
        method: "POST",
        path: "/admin/agents/dbread-agent-v1/enable",
        timestamp: new Date().toISOString(),
        key_id: "map-dev-key-1",
        body: JSON.stringify(enableBody)
      });
      const enabled = await dispatch(
        "POST",
        "/admin/agents/dbread-agent-v1/enable",
        enableBody,
        { ...enableHeaders, "x-map-admin-token": "admin-secret" }
      );
      assert.equal(enabled.statusCode, 200);

      const allowed = await dispatch("POST", "/dispatch", {
        capability: "db.read.aggregate",
        envelope: {
          task_id: "task_admin_reenabled_agent",
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
      assert.equal(allowed.statusCode, 200);
    }
  );
});

test("server admin key revoke blocks signed requests and persists across restart", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-runtime-controls-"));
  const runtimeControlStorePath = join(tempDir, "runtime-controls.json");

  try {
    await withEnv(
      {
        MAP_ADMIN_TOKEN: "admin-secret"
      },
      async () => {
        const dispatchA = createDispatcher({ runtimeControlStorePath });
        const revokeBody = { actor: "secops", reason: "compromised_key" };
        const revokeHeaders = signHttpRequest({
          method: "POST",
          path: "/admin/keys/map-dev-key-1/revoke",
          timestamp: new Date().toISOString(),
          key_id: "map-dev-key-1",
          body: JSON.stringify(revokeBody)
        });
        const revoked = await dispatchA(
          "POST",
          "/admin/keys/map-dev-key-1/revoke",
          revokeBody,
          { ...revokeHeaders, "x-map-admin-token": "admin-secret" }
        );
        assert.equal(revoked.statusCode, 200);

        const requestBody = {
          capability: "payment.execute",
          envelope: {
            task_id: "task_signed_after_revoke",
            requester_identity: { type: "user", id: "user_42" },
            target_agent: "payment-agent-v1",
            intent: "Pay approved merchant for order ORD-223",
            constraints: {
              common: {
                resource_id: "vendor_abc",
                currency: "INR",
                max_amount: 450
              },
              domain: {
                invoice_id: "INV-223",
                approved_vendor_only: true
              }
            },
            risk_class: "high",
            delegation_token: "placeholder",
            requested_output_mode: "summary"
          }
        };
        const signedHeaders = signHttpRequest({
          method: "POST",
          path: "/dispatch",
          timestamp: new Date().toISOString(),
          key_id: "map-dev-key-1",
          body: JSON.stringify(requestBody)
        });
        const blocked = await dispatchA("POST", "/dispatch", requestBody, { ...signedHeaders });
        assert.equal(blocked.statusCode, 403);
        assert.equal(blocked.body.error.code, "invalid_auth");

        const dispatchB = createDispatcher({ runtimeControlStorePath });
        const keys = await dispatchB("GET", "/.well-known/map-keys");
        const revokedKey = keys.body.keys.find(
          (key: { kid: string }) => key.kid === "map-dev-key-1"
        );
        assert.equal(revokedKey?.status, "revoked");
      }
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server admin runtime-controls endpoint returns effective control state", async () => {
  await withEnv(
    {
      MAP_ADMIN_TOKEN: "admin-secret",
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "map-dev-key-1", secret: "map-dev-secret", status: "active", demo_only: true },
        { kid: "map-dev-key-2", secret: "map-dev-secret-2", status: "active", demo_only: true }
      ]),
      MAP_SIGNING_ACTIVE_KID: "map-dev-key-2"
    },
    async () => {
      const dispatch = createDispatcher();

      const disableBody = { actor: "secops", reason: "maintenance" };
      const disableHeaders = signHttpRequest({
        method: "POST",
        path: "/admin/agents/dbread-agent-v1/disable",
        timestamp: new Date().toISOString(),
        key_id: "map-dev-key-1",
        body: JSON.stringify(disableBody)
      });
      const disabled = await dispatch(
        "POST",
        "/admin/agents/dbread-agent-v1/disable",
        disableBody,
        { ...disableHeaders, "x-map-admin-token": "admin-secret" }
      );
      assert.equal(disabled.statusCode, 200);

      const revokeBody = { actor: "secops", reason: "rotation_test" };
      const revokeHeaders = signHttpRequest({
        method: "POST",
        path: "/admin/keys/map-dev-key-1/revoke",
        timestamp: new Date().toISOString(),
        key_id: "map-dev-key-1",
        body: JSON.stringify(revokeBody)
      });
      const revoked = await dispatch(
        "POST",
        "/admin/keys/map-dev-key-1/revoke",
        revokeBody,
        { ...revokeHeaders, "x-map-admin-token": "admin-secret" }
      );
      assert.equal(revoked.statusCode, 200);

      const getHeaders = signHttpRequest({
        method: "GET",
        path: "/admin/runtime-controls",
        timestamp: new Date().toISOString(),
        key_id: "map-dev-key-2",
        body: ""
      });
      const state = await dispatch(
        "GET",
        "/admin/runtime-controls",
        undefined,
        { ...getHeaders, "x-map-admin-token": "admin-secret" }
      );
      assert.equal(state.statusCode, 200);
      assert.equal(
        typeof state.body.controls.disabled_agents["dbread-agent-v1"]?.disabled_by,
        "string"
      );
      assert.equal(
        typeof state.body.controls.revoked_keys["map-dev-key-1"]?.revoked_by,
        "string"
      );
      assert.equal(state.body.summary.disabled_agents_count >= 1, true);
      assert.equal(state.body.summary.revoked_keys_count >= 1, true);
    }
  );
});

test("server admin keys endpoint returns effective key reflection including runtime revocation metadata", async () => {
  await withEnv(
    {
      MAP_ADMIN_TOKEN: "admin-secret",
      MAP_SIGNING_KEYS: JSON.stringify([
        { kid: "map-rs-key-1", secret: "active_secret_1", status: "active", demo_only: false },
        { kid: "map-hs-key-legacy", secret: "legacy_secret", status: "retiring", demo_only: false }
      ]),
      MAP_SIGNING_ACTIVE_KID: "map-rs-key-1"
    },
    async () => {
      const dispatch = createDispatcher();

      const revokeBody = { actor: "secops", reason: "rotation_cleanup" };
      const revokeHeaders = signHttpRequest({
        method: "POST",
        path: "/admin/keys/map-hs-key-legacy/revoke",
        timestamp: new Date().toISOString(),
        key_id: "map-rs-key-1",
        body: JSON.stringify(revokeBody)
      });
      const revoked = await dispatch(
        "POST",
        "/admin/keys/map-hs-key-legacy/revoke",
        revokeBody,
        { ...revokeHeaders, "x-map-admin-token": "admin-secret" }
      );
      assert.equal(revoked.statusCode, 200);

      const getHeaders = signHttpRequest({
        method: "GET",
        path: "/admin/keys",
        timestamp: new Date().toISOString(),
        key_id: "map-rs-key-1",
        body: ""
      });
      const reflected = await dispatch(
        "GET",
        "/admin/keys",
        undefined,
        { ...getHeaders, "x-map-admin-token": "admin-secret" }
      );
      assert.equal(reflected.statusCode, 200);
      assert.equal(Array.isArray(reflected.body.keys), true);
      assert.equal(typeof reflected.body.summary.active_kid, "string");
      assert.equal(reflected.body.summary.active_kid, "map-rs-key-1");
      assert.equal(typeof reflected.body.key_provider.provider, "string");
      assert.equal(typeof reflected.body.trust.trust_domain, "string");

      const legacy = reflected.body.keys.find(
        (key: { kid: string }) => key.kid === "map-hs-key-legacy"
      );
      assert.equal(legacy?.status, "revoked");
      assert.equal(legacy?.status_source, "runtime_revoked");
      assert.equal(typeof legacy?.runtime_revocation?.revoked_by, "string");

      const active = reflected.body.keys.find(
        (key: { kid: string }) => key.kid === "map-rs-key-1"
      );
      assert.equal(active?.is_active, true);
      assert.equal(active?.signable, true);
    }
  );
});

test("server includes request_id in responses and propagates it to receipts", async () => {
  const dispatch = createDispatcher();
  const response = await dispatch(
    "POST",
    "/dispatch",
    {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_request_id_propagation",
        requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Fetch incident summary",
        constraints: {
          common: {
            environment: "staging",
            redaction_level: "basic"
          },
          domain: {
            dataset: "incident_metrics",
            service: "payments"
          }
        },
        risk_class: "medium",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      }
    },
    { "x-map-request-id": "req-test-123" }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.request_id, "req-test-123");
  assert.equal(response.body.receipt.request_id, "req-test-123");
});

test("server returns idempotent result for duplicate dispatch identity", async () => {
  const dispatch = createDispatcher();
  const payload = {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_idempotent_http",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  };

  const first = await dispatch("POST", "/dispatch", payload);
  const second = await dispatch("POST", "/dispatch", payload);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.receipt.receipt_id, first.body.receipt.receipt_id);
  assert.equal(second.body.receipt.signature, first.body.receipt.signature);
});

test("server supports x-map-idempotency-key for idempotent replay across task_ids", async () => {
  const dispatch = createDispatcher();
  const headers = { "x-map-idempotency-key": "idem-key-1" };

  const first = await dispatch(
    "POST",
    "/dispatch",
    {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_idem_header_1",
        requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
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
    headers
  );

  const second = await dispatch(
    "POST",
    "/dispatch",
    {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_idem_header_2",
        requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
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
    headers
  );

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.receipt.receipt_id, first.body.receipt.receipt_id);
});

test("server rejects x-map-idempotency-key conflict across request identity", async () => {
  const dispatch = createDispatcher();
  const headers = { "x-map-idempotency-key": "idem-key-conflict" };

  await dispatch(
    "POST",
    "/dispatch",
    {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_idem_conflict_1",
        requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
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
    headers
  );

  const conflict = await dispatch(
    "POST",
    "/dispatch",
    {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_idem_conflict_2",
        requester_identity: { type: "user", id: "engineer_2", tenant_id: "tenant_A" },
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
    headers
  );

  assert.equal(conflict.statusCode, 400);
  assert.equal(conflict.body.error.code, "conflict");
  assert.equal(conflict.body.error.retryable, false);
  assert.equal(conflict.body.error.details.category, "idempotency");
});

test("server rejects task_id conflict for different identity", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_conflict_http",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const conflict = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_conflict_http",
      requester_identity: { type: "user", id: "engineer_2" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(conflict.statusCode, 400);
  assert.equal(conflict.body.error.code, "conflict");
});

test("server rejects task_id conflict across tenants for same requester id", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_conflict_tenant_http",
      requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_A" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  const conflict = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_conflict_tenant_http",
      requester_identity: { type: "user", id: "engineer_1", tenant_id: "tenant_B" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(conflict.statusCode, 400);
  assert.equal(conflict.body.error.code, "conflict");
});

test("server persists task state when task store path is configured", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-task-store-"));
  const taskStorePath = join(tempDir, "tasks.json");

  try {
    const dispatchA = createDispatcher({ taskStorePath });
    await dispatchA("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_persisted_http",
        requester_identity: { type: "user", id: "engineer_1" },
        target_agent: "dbread-agent-v1",
        intent: "Fetch incident summary",
        constraints: {
          common: {
            environment: "staging",
            redaction_level: "basic"
          },
          domain: {
            dataset: "incident_metrics",
            service: "payments"
          }
        },
        risk_class: "medium",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      }
    });

    const dispatchB = createDispatcher({ taskStorePath });
    const restored = await dispatchB("GET", "/tasks/task_persisted_http");

    assert.equal(restored.statusCode, 200);
    assert.equal(restored.body.task.task_id, "task_persisted_http");
    assert.equal(restored.body.task.status, "completed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server persists task state when task db path is configured", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-task-db-http-"));
  const taskStoreDbPath = join(tempDir, "tasks.db");

  try {
    const dispatchA = createDispatcher({ taskStoreDbPath });
    await dispatchA("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_persisted_http_db",
        requester_identity: { type: "user", id: "engineer_1" },
        target_agent: "dbread-agent-v1",
        intent: "Fetch incident summary",
        constraints: {
          common: {
            environment: "staging",
            redaction_level: "basic"
          },
          domain: {
            dataset: "incident_metrics",
            service: "payments"
          }
        },
        risk_class: "medium",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      }
    });

    const dispatchB = createDispatcher({ taskStoreDbPath });
    const restored = await dispatchB("GET", "/tasks/task_persisted_http_db");

    assert.equal(restored.statusCode, 200);
    assert.equal(restored.body.task.task_id, "task_persisted_http_db");
    assert.equal(restored.body.task.status, "completed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("server filters task list by tenant_id", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_tenant_a_list",
      requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
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
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_tenant_b_list",
      requester_identity: { type: "user", id: "engineer_b", tenant_id: "tenant_B" },
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

  const response = await dispatch("GET", "/tasks?tenant_id=tenant_A");
  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.body.tasks), true);
  assert.equal(
    response.body.tasks.every(
      (task: { requester_identity: { tenant_id?: string } }) =>
        task.requester_identity?.tenant_id === "tenant_A"
    ),
    true
  );
  assert.equal(typeof response.body.pagination?.limit, "number");
});

test("server tasks endpoint supports pagination and etag conditional requests", async () => {
  const dispatch = createDispatcher();
  for (const taskId of ["task_page_1", "task_page_2", "task_page_3"]) {
    await dispatch("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: taskId,
        requester_identity: { type: "user", id: "engineer_page", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Paginate task list",
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

  const page1 = await dispatch("GET", "/tasks?tenant_id=tenant_A&limit=2");
  assert.equal(page1.statusCode, 200);
  assert.equal(Array.isArray(page1.body.tasks), true);
  assert.equal(page1.body.tasks.length, 2);
  assert.equal(typeof page1.body.pagination.next_cursor, "string");
  assert.equal(typeof page1.headers.etag, "string");

  const page2 = await dispatch(
    "GET",
    `/tasks?tenant_id=tenant_A&limit=2&cursor=${encodeURIComponent(
      page1.body.pagination.next_cursor
    )}`
  );
  assert.equal(page2.statusCode, 200);
  assert.equal(page2.body.tasks.length >= 1, true);

  const notModified = await dispatch("GET", "/tasks?tenant_id=tenant_A&limit=2", undefined, {
    "if-none-match": page1.headers.etag
  });
  assert.equal(notModified.statusCode, 304);
});

test("server filters metrics by tenant_id", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_metrics_tenant_a",
      requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
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
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_metrics_tenant_b",
      requester_identity: { type: "user", id: "engineer_b", tenant_id: "tenant_B" },
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

  const response = await dispatch("GET", "/metrics?tenant_id=tenant_A");
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.metrics.tasks.total >= 1, true);
  assert.equal(
    Object.keys(response.body.metrics.tasks.by_agent).every(
      (agentId) => agentId === "dbread-agent-v1"
    ),
    true
  );
  assert.equal(
    Object.keys(response.body.metrics.tasks.by_capability).every(
      (capability) => capability === "db.read.aggregate"
    ),
    true
  );
  const receiptKeyUsage = response.body.metrics.signing.key_usage.receipts_by_key_id;
  const receiptKeyTotal = Object.values(receiptKeyUsage).reduce(
    (acc: number, value: unknown) => acc + Number(value),
    0
  );
  assert.equal(receiptKeyTotal >= 1, true);
});

test("server enforces tenant filter for /tasks/:id when tenant_id is provided", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_tenant_lookup",
      requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
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

  const blocked = await dispatch("GET", "/tasks/task_tenant_lookup?tenant_id=tenant_B");
  assert.equal(blocked.statusCode, 404);
  assert.equal(blocked.body.error.code, "task_not_found");

  const allowed = await dispatch("GET", "/tasks/task_tenant_lookup?tenant_id=tenant_A");
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.task.task_id, "task_tenant_lookup");
});

test("server denies dispatch when strict tenant mode is enabled and tenant is missing", async () => {
  const dispatch = createDispatcher({ requireTenant: true });
  const response = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_missing_tenant_strict",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
          redaction_level: "basic"
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments"
        }
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "policy_denied");
});

test("server filters receipt list by tenant_id", async () => {
  const dispatch = createDispatcher();
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_receipt_tenant_a",
      requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
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
  await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_receipt_tenant_b",
      requester_identity: { type: "user", id: "engineer_b", tenant_id: "tenant_B" },
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

  const response = await dispatch("GET", "/receipts?tenant_id=tenant_A");
  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.body.receipts), true);
  assert.equal(
    response.body.receipts.every(
      (receipt: { tenant_id?: string }) => receipt.tenant_id === "tenant_A"
    ),
    true
  );
  assert.equal(typeof response.body.pagination?.limit, "number");
});

test("server receipts endpoint supports pagination and etag conditional requests", async () => {
  const dispatch = createDispatcher();
  for (const taskId of ["task_receipt_page_1", "task_receipt_page_2", "task_receipt_page_3"]) {
    await dispatch("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: taskId,
        requester_identity: { type: "user", id: "engineer_receipt_page", tenant_id: "tenant_A" },
        target_agent: "dbread-agent-v1",
        intent: "Paginate receipt list",
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

  const page1 = await dispatch("GET", "/receipts?tenant_id=tenant_A&limit=2");
  assert.equal(page1.statusCode, 200);
  assert.equal(Array.isArray(page1.body.receipts), true);
  assert.equal(page1.body.receipts.length, 2);
  assert.equal(typeof page1.body.pagination.next_cursor, "string");
  assert.equal(typeof page1.headers.etag, "string");

  const page2 = await dispatch(
    "GET",
    `/receipts?tenant_id=tenant_A&limit=2&cursor=${encodeURIComponent(
      page1.body.pagination.next_cursor
    )}`
  );
  assert.equal(page2.statusCode, 200);
  assert.equal(page2.body.receipts.length >= 1, true);

  const notModified = await dispatch("GET", "/receipts?tenant_id=tenant_A&limit=2", undefined, {
    "if-none-match": page1.headers.etag
  });
  assert.equal(notModified.statusCode, 304);
});

test("server enforces tenant filter for /receipts/:id when tenant_id is provided", async () => {
  const dispatch = createDispatcher();
  const issued = await dispatch("POST", "/dispatch", {
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_receipt_lookup_tenant",
      requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
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
  const receiptId = String(issued.body.receipt.receipt_id);

  const blocked = await dispatch("GET", `/receipts/${encodeURIComponent(receiptId)}?tenant_id=tenant_B`);
  assert.equal(blocked.statusCode, 404);
  assert.equal(blocked.body.error.code, "receipt_not_found");

  const allowed = await dispatch("GET", `/receipts/${encodeURIComponent(receiptId)}?tenant_id=tenant_A`);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.receipt.receipt_id, receiptId);
});

test("server persists receipts independently when receipt store path is configured", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-receipts-"));
  const receiptStorePath = join(tempDir, "receipts.json");

  try {
    const dispatchA = createDispatcher({ receiptStorePath });
    const issued = await dispatchA("POST", "/dispatch", {
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_receipt_persist_only",
        requester_identity: { type: "user", id: "engineer_a", tenant_id: "tenant_A" },
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
    const receiptId = String(issued.body.receipt.receipt_id);

    const dispatchB = createDispatcher({ receiptStorePath });
    const restored = await dispatchB("GET", `/receipts/${encodeURIComponent(receiptId)}`);
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.body.receipt.receipt_id, receiptId);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
