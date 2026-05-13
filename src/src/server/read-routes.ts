import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getActiveSignatureKeyId,
  getSignatureKeyId,
  getSigningProviderStatus,
  getTrustMetadata,
  signAuditExport,
  signConformanceExport,
  signTrustBundle,
} from "../security/signing.js";
import { checkWritableFilePath, parsePositiveIntOrDefault } from "./utils.js";

interface AlertRecord {
  id: string;
  source: "queue" | "requests" | "signing";
  code: string;
  severity: "warning" | "critical";
  message: string;
  recommended_action: string;
  first_seen: string;
  last_seen: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  suppressed_until?: string;
  suppressed_by?: string;
  tenant_id?: string;
}

interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  deploymentProfile: "open" | "verified" | "regulated";
  options: {
    taskStorePath?: string;
    taskStoreDbPath?: string;
    receiptStorePath?: string;
    receiptStoreDbPath?: string;
    deadLetterStorePath?: string;
    metricsStorePath?: string;
    auditStorePath?: string;
    rateLimitMaxRequests?: number;
    rateLimitMaxRequestsPerTenant?: number;
    enforceSignedRequests?: boolean;
    requireTenant?: boolean;
    asyncQueueMaxAttempts?: number;
    asyncQueueRetryDelayMs?: number;
    asyncQueueMaxRetryDelayMs?: number;
    asyncQueueRetryJitterRatio?: number;
    asyncQueueMaxConcurrent?: number;
    asyncQueueMaxConcurrentPerTenant?: number;
    asyncQueueMaxQueueDepth?: number;
    asyncQueueMaxDeadLetters?: number;
    healthMaxDeadLetters?: number;
    healthMaxOldestDeadLetterAgeMs?: number;
    metricsFailureRateThreshold?: number;
  };
  app: {
    registry: {
      list(): any[];
      findByCapability(capability: string): any[];
      findByDomain(domain: string): any[];
    };
    taskStore: {
      list(historyLength?: number): any[];
      listByTenant(tenantId: string, historyLength?: number): any[];
      getByTenant(
        taskId: string,
        tenantId: string,
        historyLength?: number,
      ): any;
    };
    receiptStore: {
      list(tenantId?: string): any[];
      get(receiptId: string, tenantId?: string): any;
    };
    asyncQueue: {
      getStats(): any;
      listDeadLetters(): any[];
      listDeadLettersByTenant(tenantId: string): any[];
    };
    orchestrator: {
      getTask(taskId: string): any;
    };
  };
  metricsWindowMs: number;
  rateLimitWindowMs: number;
  maxLatencySamplesPerCapability: number;
  auditMaxEvents: number;
  auditCheckpointInterval: number;
  signingRetiringKeyCriticalRatio: number;
  signingUnknownKeyCriticalRatio: number;
  taskStorePersistencePath?: string;
  receiptStorePersistencePath?: string;
  auditEvents: any[];
  auditCheckpoints: any[];
  alertState: Map<string, AlertRecord>;
  getEffectiveVerificationKeys(): any[];
  evaluateDeploymentProfile(): {
    profile: "open" | "verified" | "regulated";
    compliant: boolean;
    violations: string[];
  };
  verifyAuditIntegrity(): {
    ok: boolean;
    errors: string[];
    summary: {
      events_checked: number;
      checkpoints_checked: number;
      latest_chain_index: number;
    };
  };
  collectSigningKeyUsage(): {
    agent_descriptors_by_key_id: Record<string, number>;
    receipts_by_key_id: Record<string, number>;
    audit_checkpoints_by_key_id: Record<string, number>;
  };
  collectSigningKeyUsageForData(input: {
    descriptors: any[];
    receipts: any[];
    checkpoints: any[];
  }): {
    agent_descriptors_by_key_id: Record<string, number>;
    receipts_by_key_id: Record<string, number>;
    audit_checkpoints_by_key_id: Record<string, number>;
  };
  collectSigningAnomalies(signingUsage: {
    agent_descriptors_by_key_id: Record<string, number>;
    receipts_by_key_id: Record<string, number>;
    audit_checkpoints_by_key_id: Record<string, number>;
  }): {
    unknown_key_usage_detected: boolean;
    retiring_key_usage_detected: boolean;
    unknown_key_usage_ratio: number;
    retiring_key_usage_ratio: number;
    total_signatures_analyzed: number;
    thresholds: {
      unknown_key_critical_ratio: number;
      retiring_key_critical_ratio: number;
    };
    threshold_breaches: {
      unknown_key_ratio_exceeded: boolean;
      retiring_key_ratio_exceeded: boolean;
    };
    severity: "ok" | "warning" | "critical";
    recommended_action: string;
  };
  getRequestMetrics(): any;
  getAlerts(requestMetrics: any, queueStats: any, deadLetterCount: number): any;
  getCapabilityLatencyMetrics(): Record<
    string,
    { count: number; avg_ms: number; p50_ms: number; p95_ms: number }
  >;
  getActiveAlerts(tenantId?: string): AlertRecord[];
  persistAlertState(): void;
  sendJson(
    res: ServerResponse,
    statusCode: number,
    body: unknown,
    requestId: string,
    tracking?: { ok: boolean; errorCode?: string; targetAgent?: string },
    extraHeaders?: Record<string, string>,
  ): void;
  sendError(
    res: ServerResponse,
    statusCode: number,
    requestId: string,
    error: {
      code: string;
      message: string;
      retryable: boolean;
      details?: Record<string, unknown>;
    },
    targetAgent?: string,
  ): void;
  readJsonBody(req: IncomingMessage): Promise<{ raw: string; parsed: unknown }>;
  snapshotRuntimeControls(): {
    disabled_agents: Record<string, unknown>;
    disabled_capabilities: Record<string, Record<string, unknown>>;
    revoked_keys: Record<string, unknown>;
  };
  getAdminTokenError(
    req: IncomingMessage,
    rawBody: string,
  ): Promise<{ statusCode: number; code: string; message: string } | null>;
  getRuntimeRevocationMetadata(
    keyId: string,
  ): { revoked_at: string; revoked_by: string; reason?: string } | null;
}

function sendEtagJson(
  ctx: RouteContext,
  body: unknown,
  headers: Record<string, string>,
  requestId = ctx.requestId,
): true {
  const etag = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const ifNoneMatch = ctx.req.headers["if-none-match"];
  if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
    ctx.res.writeHead(304, { ...headers, etag });
    ctx.res.end();
    return true;
  }
  ctx.sendJson(
    ctx.res,
    200,
    body,
    requestId,
    { ok: true },
    { ...headers, etag },
  );
  return true;
}

export async function handleReadRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";
  const hostHeader =
    typeof req.headers.host === "string" ? req.headers.host : "localhost";
  const origin = /^https?:\/\//.test(hostHeader)
    ? hostHeader
    : `http://${hostHeader}`;
  if (
    req.method === "GET" &&
    (requestUrlString === "/.well-known/map" ||
      requestUrlString === "/.well-known/map.json")
  ) {
    const host = req.headers.host ?? "localhost";
    const baseUrl = `http://${host}`;
    const agents = ctx.app.registry.list();
    const body = {
      protocol: {
        name: "MAP",
        discovery_version: "v1",
      },
      provider: {
        provider_id: host,
        display_name: `MAP Provider (${ctx.deploymentProfile})`,
      },
      trust: {
        key_discovery_url: `${baseUrl}/.well-known/map-keys`,
      },
      documentation: {
        agents_url: `${baseUrl}/agents`,
      },
      agents: {
        items: agents,
      },
    };
    return sendEtagJson(ctx, body, {
      "cache-control": "public, max-age=300, must-revalidate",
    });
  }

  if (req.method === "GET" && req.url === "/health") {
    const queueStats = ctx.app.asyncQueue.getStats();
    const maxDeadLetters = ctx.options.healthMaxDeadLetters;
    const maxOldestDeadLetterAgeMs = ctx.options.healthMaxOldestDeadLetterAgeMs;
    const deadLetterCountExceeded =
      typeof maxDeadLetters === "number" &&
      queueStats.dead_letter_count > maxDeadLetters;
    const deadLetterAgeExceeded =
      typeof maxOldestDeadLetterAgeMs === "number" &&
      typeof queueStats.oldest_dead_letter_age_ms === "number" &&
      queueStats.oldest_dead_letter_age_ms > maxOldestDeadLetterAgeMs;
    const degraded = deadLetterCountExceeded || deadLetterAgeExceeded;
    const profileEvaluation = ctx.evaluateDeploymentProfile();
    const reasons: string[] = [];
    if (deadLetterCountExceeded) {
      reasons.push("dead_letter_count_exceeded");
    }
    if (deadLetterAgeExceeded) {
      reasons.push("oldest_dead_letter_age_exceeded");
    }
    if (!profileEvaluation.compliant) {
      reasons.push("deployment_profile_non_compliant");
    }
    ctx.sendJson(
      res,
      200,
      {
        status: degraded ? "degraded" : "ok",
        protocol: "MAP",
        version: "0.1.0",
        checks: {
          queue: queueStats,
          deployment_profile: profileEvaluation,
          ...(degraded ? { degraded_reasons: reasons } : {}),
        },
      },
      requestId,
    );
    return true;
  }

  if (req.method === "GET" && req.url === "/ready") {
    const taskStore = checkWritableFilePath(ctx.taskStorePersistencePath);
    const receiptStore = checkWritableFilePath(ctx.receiptStorePersistencePath);
    const deadLetterStore = checkWritableFilePath(
      ctx.options.deadLetterStorePath,
    );
    const metricsStore = checkWritableFilePath(ctx.options.metricsStorePath);
    const profileEvaluation = ctx.evaluateDeploymentProfile();
    const allWritable =
      taskStore.writable &&
      receiptStore.writable &&
      deadLetterStore.writable &&
      metricsStore.writable &&
      profileEvaluation.compliant;

    ctx.sendJson(
      res,
      allWritable ? 200 : 503,
      {
        status: allWritable ? "ready" : "not_ready",
        protocol: "MAP",
        version: "0.1.0",
        checks: {
          task_store: taskStore,
          receipt_store: receiptStore,
          dead_letter_store: deadLetterStore,
          metrics_store: metricsStore,
          deployment_profile: profileEvaluation,
        },
      },
      requestId,
    );
    return true;
  }

  if (req.method === "GET" && req.url === "/status") {
    const signingKeyUsage = ctx.collectSigningKeyUsage();
    const signingAnomalies = ctx.collectSigningAnomalies(signingKeyUsage);
    ctx.sendJson(
      res,
      200,
      {
        status: "ok",
        protocol: "MAP",
        version: "0.1.0",
        runtime: {
          node_version: process.version,
          uptime_s: Math.floor(process.uptime()),
        },
        config: {
          enforce_signed_requests: ctx.options.enforceSignedRequests ?? false,
          require_tenant: ctx.options.requireTenant ?? false,
          deployment_profile: ctx.deploymentProfile,
          async_queue: {
            max_attempts: Math.max(1, ctx.options.asyncQueueMaxAttempts ?? 3),
            retry_delay_ms: Math.max(
              1,
              ctx.options.asyncQueueRetryDelayMs ?? 50,
            ),
            max_retry_delay_ms: Math.max(
              Math.max(1, ctx.options.asyncQueueRetryDelayMs ?? 50),
              ctx.options.asyncQueueMaxRetryDelayMs ?? 5_000,
            ),
            retry_jitter_ratio: Math.max(
              0,
              Math.min(1, ctx.options.asyncQueueRetryJitterRatio ?? 0.2),
            ),
            max_concurrent: Math.max(
              1,
              ctx.options.asyncQueueMaxConcurrent ?? 4,
            ),
            max_concurrent_per_tenant:
              typeof ctx.options.asyncQueueMaxConcurrentPerTenant === "number"
                ? Math.max(1, ctx.options.asyncQueueMaxConcurrentPerTenant)
                : null,
            max_queue_depth: Math.max(
              1,
              ctx.options.asyncQueueMaxQueueDepth ?? 1_000,
            ),
            max_dead_letters: Math.max(
              1,
              ctx.options.asyncQueueMaxDeadLetters ?? 500,
            ),
          },
          health_thresholds: {
            dead_letter_count: ctx.options.healthMaxDeadLetters ?? null,
            oldest_dead_letter_age_ms:
              ctx.options.healthMaxOldestDeadLetterAgeMs ?? null,
          },
          metrics: {
            window_ms: ctx.metricsWindowMs,
            max_latency_samples_per_capability:
              ctx.maxLatencySamplesPerCapability,
            failure_rate_threshold:
              ctx.options.metricsFailureRateThreshold ?? null,
          },
          rate_limits: {
            window_ms: ctx.rateLimitWindowMs,
            max_requests_global: ctx.options.rateLimitMaxRequests ?? null,
            max_requests_per_tenant:
              ctx.options.rateLimitMaxRequestsPerTenant ?? null,
          },
          audit: {
            store_configured: Boolean(ctx.options.auditStorePath),
            max_events: ctx.auditMaxEvents,
            checkpoint_interval: ctx.auditCheckpointInterval,
          },
          signing: {
            verification_keys: ctx.getEffectiveVerificationKeys(),
            key_provider: getSigningProviderStatus(),
            key_usage: signingKeyUsage,
            thresholds: {
              unknown_key_critical_ratio: ctx.signingUnknownKeyCriticalRatio,
              retiring_key_critical_ratio: ctx.signingRetiringKeyCriticalRatio,
            },
            anomalies: signingAnomalies,
          },
          stores: {
            task_store_configured: Boolean(ctx.taskStorePersistencePath),
            dead_letter_store_configured: Boolean(
              ctx.options.deadLetterStorePath,
            ),
            metrics_store_configured: Boolean(ctx.options.metricsStorePath),
          },
        },
      },
      requestId,
    );
    return true;
  }

  if (
    req.method === "GET" &&
    requestUrlString.startsWith("/.well-known/map-keys")
  ) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const includePemByQuery = requestUrl.searchParams.get("include_pem");
    const format = requestUrl.searchParams.get("format");
    const cursor = requestUrl.searchParams.get("cursor");
    const limitRaw = requestUrl.searchParams.get("limit");
    const exposePemDefault =
      process.env.MAP_KEY_DISCOVERY_EXPOSE_PEM !== "false";
    const includePem =
      format === "jwk"
        ? false
        : includePemByQuery === "false"
          ? false
          : exposePemDefault;
    const keyDiscoveryMaxAge = Math.max(
      0,
      Number(process.env.MAP_KEY_DISCOVERY_CACHE_MAX_AGE_SEC ?? 60),
    );
    const limit = Math.max(
      1,
      Math.min(
        1000,
        limitRaw && Number.isFinite(Number(limitRaw))
          ? Math.floor(Number(limitRaw))
          : 100,
      ),
    );
    const allKeys = ctx
      .getEffectiveVerificationKeys()
      .map((key) => {
        if (includePem) {
          return key;
        }
        const { public_key_pem: _publicKeyPem, ...withoutPem } = key;
        return withoutPem;
      })
      .sort((a, b) => a.kid.localeCompare(b.kid));
    const startIndex = cursor
      ? Math.max(0, allKeys.findIndex((key) => key.kid === cursor) + 1)
      : 0;
    const keys = allKeys.slice(startIndex, startIndex + limit);
    const nextCursorIndex = startIndex + limit;
    const nextCursor =
      nextCursorIndex < allKeys.length
        ? (allKeys[nextCursorIndex - 1]?.kid ?? null)
        : null;
    const activeKid = getActiveSignatureKeyId();
    return sendEtagJson(
      ctx,
      {
        keys,
        active_kid: activeKid,
        signing_profile: keys.some((key) => key.alg === "RS256")
          ? "mixed_or_asymmetric"
          : "symmetric",
        trust: getTrustMetadata(ctx.deploymentProfile),
        rotation_hints: {
          cache_max_age_sec: keyDiscoveryMaxAge,
          revoked_kids: allKeys
            .filter((key) => key.status === "revoked")
            .map((key) => key.kid),
          recommended_refresh_on_invalid_signature: true,
        },
        pagination: {
          limit,
          next_cursor: nextCursor,
        },
      },
      {
        "cache-control": `public, max-age=${keyDiscoveryMaxAge}, must-revalidate`,
      },
    );
  }

  if (req.method === "GET" && req.url === "/agents") {
    ctx.sendJson(res, 200, { agents: ctx.app.registry.list() }, requestId);
    return true;
  }

  if (
    req.method === "GET" &&
    (requestUrlString === "/dead-letters" ||
      requestUrlString.startsWith("/dead-letters?"))
  ) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const tenantId = requestUrl.searchParams.get("tenant_id");
    const cursor = requestUrl.searchParams.get("cursor");
    const limit = Math.max(
      1,
      Math.min(
        500,
        parsePositiveIntOrDefault(requestUrl.searchParams.get("limit"), 100),
      ),
    );
    const allDeadLetters = tenantId
      ? ctx.app.asyncQueue.listDeadLettersByTenant(tenantId)
      : ctx.app.asyncQueue.listDeadLetters();
    const startIndex = cursor
      ? Math.max(
          0,
          allDeadLetters.findIndex((record) => record.task_id === cursor) + 1,
        )
      : 0;
    const deadLetters = allDeadLetters.slice(startIndex, startIndex + limit);
    const nextCursorIndex = startIndex + limit;
    const nextCursor =
      nextCursorIndex < allDeadLetters.length
        ? (allDeadLetters[nextCursorIndex - 1]?.task_id ?? null)
        : null;
    return sendEtagJson(
      ctx,
      {
        dead_letters: deadLetters,
        pagination: {
          limit,
          next_cursor: nextCursor,
        },
      },
      { "cache-control": "no-cache" },
    );
  }

  if (
    req.method === "GET" &&
    (requestUrlString === "/alerts" || requestUrlString.startsWith("/alerts?"))
  ) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const tenantId = requestUrl.searchParams.get("tenant_id");
    const cursor = requestUrl.searchParams.get("cursor");
    const limit = Math.max(
      1,
      Math.min(
        500,
        parsePositiveIntOrDefault(requestUrl.searchParams.get("limit"), 100),
      ),
    );
    const allAlerts = tenantId
      ? ctx.getActiveAlerts(tenantId)
      : ctx.getActiveAlerts();
    const startIndex = cursor
      ? Math.max(0, allAlerts.findIndex((alert) => alert.id === cursor) + 1)
      : 0;
    const alerts = allAlerts.slice(startIndex, startIndex + limit);
    const nextCursorIndex = startIndex + limit;
    const nextCursor =
      nextCursorIndex < allAlerts.length
        ? (allAlerts[nextCursorIndex - 1]?.id ?? null)
        : null;
    return sendEtagJson(
      ctx,
      {
        alerts,
        pagination: {
          limit,
          next_cursor: nextCursor,
        },
      },
      { "cache-control": "no-cache" },
    );
  }

  if (
    req.method === "GET" &&
    (requestUrlString === "/audit-events" ||
      requestUrlString.startsWith("/audit-events?"))
  ) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const tenantId = requestUrl.searchParams.get("tenant_id");
    const cursorRaw = requestUrl.searchParams.get("cursor");
    const cursor =
      cursorRaw && Number.isFinite(Number(cursorRaw))
        ? Math.floor(Number(cursorRaw))
        : null;
    const limit = Math.max(
      1,
      Math.min(
        500,
        parsePositiveIntOrDefault(requestUrl.searchParams.get("limit"), 100),
      ),
    );
    const allEvents = tenantId
      ? ctx.auditEvents.filter(
          (event) => (event.tenant_id ?? "default") === tenantId,
        )
      : ctx.auditEvents;
    const startIndex = cursor
      ? Math.max(
          0,
          allEvents.findIndex((event) => event.chain_index === cursor) + 1,
        )
      : 0;
    const events = allEvents.slice(startIndex, startIndex + limit);
    const nextCursorIndex = startIndex + limit;
    const nextCursor =
      nextCursorIndex < allEvents.length
        ? (allEvents[nextCursorIndex - 1]?.chain_index ?? null)
        : null;
    return sendEtagJson(
      ctx,
      {
        events,
        checkpoints: ctx.auditCheckpoints,
        pagination: {
          limit,
          next_cursor: nextCursor,
        },
      },
      { "cache-control": "no-cache" },
    );
  }

  if (req.method === "GET" && req.url === "/audit-events/verify") {
    const verification = ctx.verifyAuditIntegrity();
    ctx.sendJson(res, verification.ok ? 200 : 500, { verification }, requestId);
    return true;
  }

  if (req.method === "GET" && req.url === "/audit-events/export") {
    const latestEvent = ctx.auditEvents[ctx.auditEvents.length - 1];
    const exportPayload = {
      export_id: `audit-export:${randomUUID()}`,
      created_at: new Date().toISOString(),
      events_count: ctx.auditEvents.length,
      checkpoints_count: ctx.auditCheckpoints.length,
      latest_chain_index: latestEvent?.chain_index ?? 0,
      latest_event_hash: latestEvent?.event_hash ?? "GENESIS",
    };
    const exportSignature = signAuditExport(exportPayload);
    const exportKeyId = getSignatureKeyId(exportSignature) ?? "unknown";
    ctx.sendJson(
      res,
      200,
      {
        export: {
          ...exportPayload,
          signature: exportSignature,
          key_id: exportKeyId,
        },
        events: ctx.auditEvents,
        checkpoints: ctx.auditCheckpoints,
      },
      requestId,
    );
    return true;
  }

  if (req.method === "GET" && req.url === "/conformance/export") {
    const taskStore = checkWritableFilePath(ctx.taskStorePersistencePath);
    const receiptStore = checkWritableFilePath(ctx.receiptStorePersistencePath);
    const deadLetterStore = checkWritableFilePath(
      ctx.options.deadLetterStorePath,
    );
    const metricsStore = checkWritableFilePath(ctx.options.metricsStorePath);
    const profileEvaluation = ctx.evaluateDeploymentProfile();
    const auditVerification = ctx.verifyAuditIntegrity();
    const activeKeyId = getActiveSignatureKeyId();
    const checks = [
      { name: "deployment_profile_compliant", ok: profileEvaluation.compliant },
      { name: "task_store_writable", ok: taskStore.writable },
      { name: "receipt_store_writable", ok: receiptStore.writable },
      { name: "dead_letter_store_writable", ok: deadLetterStore.writable },
      { name: "metrics_store_writable", ok: metricsStore.writable },
      { name: "audit_integrity_ok", ok: auditVerification.ok },
      {
        name: "active_signing_key_available",
        ok: typeof activeKeyId === "string" && activeKeyId.length > 0,
      },
    ];
    const passedChecks = checks.filter((check) => check.ok).length;
    const artifact = {
      profile: ctx.deploymentProfile,
      checks,
      deployment_profile: profileEvaluation,
      stores: {
        task_store: taskStore,
        receipt_store: receiptStore,
        dead_letter_store: deadLetterStore,
        metrics_store: metricsStore,
      },
      audit_verification: auditVerification,
    };
    const artifactHash = createHash("sha256")
      .update(JSON.stringify(artifact))
      .digest("hex");
    const conformancePayload = {
      export_id: `conformance-export:${randomUUID()}`,
      created_at: new Date().toISOString(),
      profile: ctx.deploymentProfile,
      total_checks: checks.length,
      passed_checks: passedChecks,
      failed_checks: checks.length - passedChecks,
      artifact_hash: artifactHash,
    };
    const signature = signConformanceExport(conformancePayload);
    const keyId = getSignatureKeyId(signature) ?? "unknown";
    ctx.sendJson(
      res,
      200,
      {
        conformance: {
          ...conformancePayload,
          key_id: keyId,
          signature,
        },
        artifact,
      },
      requestId,
    );
    return true;
  }

  if (req.method === "GET" && req.url === "/trust-bundle/export") {
    const keys = ctx.getEffectiveVerificationKeys();
    const trust = getTrustMetadata(ctx.deploymentProfile);
    const keysHash = createHash("sha256")
      .update(JSON.stringify(keys))
      .digest("hex");
    const bundlePayload = {
      bundle_id: `trust-bundle:${randomUUID()}`,
      created_at: new Date().toISOString(),
      trust_domain: trust.trust_domain,
      issuer: trust.issuer,
      profile: trust.profile,
      keys_hash: keysHash,
    };
    const signature = signTrustBundle(bundlePayload);
    const keyId = getSignatureKeyId(signature) ?? "unknown";
    ctx.sendJson(
      res,
      200,
      {
        trust_bundle: {
          ...bundlePayload,
          key_id: keyId,
          signature,
        },
        keys,
      },
      requestId,
    );
    return true;
  }

  if (req.method === "GET" && req.url === "/metrics") {
    const queueStats = ctx.app.asyncQueue.getStats();
    const requestMetrics = ctx.getRequestMetrics();
    const alerts = ctx.getAlerts(
      requestMetrics,
      queueStats,
      queueStats.dead_letter_count,
    );
    const signingKeyUsage = ctx.collectSigningKeyUsage();
    const signingAnomalies = ctx.collectSigningAnomalies(signingKeyUsage);
    const allTasks = ctx.app.taskStore.list();
    const taskStatusCounts = allTasks.reduce<Record<string, number>>(
      (acc, task) => {
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const taskCapabilityCounts = allTasks.reduce<Record<string, number>>(
      (acc, task) => {
        acc[task.capability] = (acc[task.capability] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const taskAgentCounts = allTasks.reduce<Record<string, number>>(
      (acc, task) => {
        acc[task.target_agent] = (acc[task.target_agent] ?? 0) + 1;
        return acc;
      },
      {},
    );
    ctx.sendJson(
      res,
      200,
      {
        metrics: {
          queue: ctx.app.asyncQueue.getStats(),
          tasks: {
            total: allTasks.length,
            by_status: taskStatusCounts,
            by_capability: taskCapabilityCounts,
            by_agent: taskAgentCounts,
          },
          requests: requestMetrics,
          errors: requestMetrics.errors,
          latencies: {
            by_capability: ctx.getCapabilityLatencyMetrics(),
          },
          signing: {
            key_usage: signingKeyUsage,
            anomalies: signingAnomalies,
          },
          alerts,
        },
      },
      requestId,
    );
    return true;
  }

  if (req.method === "GET" && requestUrlString.startsWith("/tasks")) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    if (requestUrl.pathname === "/tasks") {
      const tenantId = requestUrl.searchParams.get("tenant_id");
      const cursor = requestUrl.searchParams.get("cursor");
      const historyLengthRaw = requestUrl.searchParams.get("history_length");
      const historyLength =
        historyLengthRaw !== null
          ? parsePositiveIntOrDefault(historyLengthRaw, 0)
          : undefined;
      const limit = Math.max(
        1,
        Math.min(
          500,
          parsePositiveIntOrDefault(requestUrl.searchParams.get("limit"), 100),
        ),
      );
      const allTasks = tenantId
        ? ctx.app.taskStore.listByTenant(tenantId, historyLength)
        : ctx.app.taskStore.list(historyLength);
      const orderId = requestUrl.searchParams.get("order_id");
      const contextId = requestUrl.searchParams.get("context_id");
      const filteredTasks = (() => {
        let tasks = allTasks;
        if (orderId) {
          tasks = tasks.filter((task) => task.order_id === orderId);
        }
        if (contextId) {
          tasks = tasks.filter((task) => task.context_id === contextId);
        }
        return tasks;
      })();
      const startIndex = cursor
        ? Math.max(
            0,
            filteredTasks.findIndex((task) => task.task_id === cursor) + 1,
          )
        : 0;
      const tasks = filteredTasks.slice(startIndex, startIndex + limit);
      const nextCursorIndex = startIndex + limit;
      const nextCursor =
        nextCursorIndex < filteredTasks.length
          ? (filteredTasks[nextCursorIndex - 1]?.task_id ?? null)
          : null;
      return sendEtagJson(
        ctx,
        {
          tasks,
          pagination: {
            limit,
            next_cursor: nextCursor,
          },
        },
        { "cache-control": "no-cache" },
      );
    }
  }

  if (req.method === "GET" && requestUrlString.startsWith("/receipts")) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    if (requestUrl.pathname === "/receipts") {
      const tenantId = requestUrl.searchParams.get("tenant_id");
      const cursor = requestUrl.searchParams.get("cursor");
      const limit = Math.max(
        1,
        Math.min(
          500,
          parsePositiveIntOrDefault(requestUrl.searchParams.get("limit"), 100),
        ),
      );
      const allReceipts = tenantId
        ? ctx.app.receiptStore.list(tenantId)
        : ctx.app.receiptStore.list();
      const startIndex = cursor
        ? Math.max(
            0,
            allReceipts.findIndex((receipt) => receipt.receipt_id === cursor) +
              1,
          )
        : 0;
      const receipts = allReceipts.slice(startIndex, startIndex + limit);
      const nextCursorIndex = startIndex + limit;
      const nextCursor =
        nextCursorIndex < allReceipts.length
          ? (allReceipts[nextCursorIndex - 1]?.receipt_id ?? null)
          : null;
      return sendEtagJson(
        ctx,
        {
          receipts,
          pagination: {
            limit,
            next_cursor: nextCursor,
          },
        },
        { "cache-control": "no-cache" },
      );
    }
  }

  if (
    req.method === "POST" &&
    requestUrlString.startsWith("/alerts/") &&
    requestUrlString.endsWith("/ack")
  ) {
    const path = new URL(requestUrlString, "http://localhost").pathname;
    const alertId = decodeURIComponent(
      path.slice("/alerts/".length, -"/ack".length),
    );
    const existing = ctx.alertState.get(alertId);
    if (!existing) {
      ctx.sendError(res, 404, requestId, {
        code: "alert_not_found",
        message: `Alert not found: ${alertId}`,
        retryable: false,
      });
      return true;
    }
    const body = await ctx.readJsonBody(req);
    const parsedBody =
      body.parsed && typeof body.parsed === "object"
        ? (body.parsed as { actor?: unknown })
        : {};
    const actor =
      typeof parsedBody.actor === "string" && parsedBody.actor.trim().length > 0
        ? parsedBody.actor.trim()
        : "system";
    const updated: AlertRecord = {
      ...existing,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: actor,
    };
    ctx.alertState.set(alertId, updated);
    ctx.persistAlertState();
    ctx.sendJson(res, 200, { alert: updated }, requestId);
    return true;
  }

  if (
    req.method === "POST" &&
    requestUrlString.startsWith("/alerts/") &&
    requestUrlString.endsWith("/suppress")
  ) {
    const path = new URL(requestUrlString, "http://localhost").pathname;
    const alertId = decodeURIComponent(
      path.slice("/alerts/".length, -"/suppress".length),
    );
    const existing = ctx.alertState.get(alertId);
    if (!existing) {
      ctx.sendError(res, 404, requestId, {
        code: "alert_not_found",
        message: `Alert not found: ${alertId}`,
        retryable: false,
      });
      return true;
    }
    const body = await ctx.readJsonBody(req);
    const parsedBody =
      body.parsed && typeof body.parsed === "object"
        ? (body.parsed as {
            actor?: unknown;
            duration_seconds?: unknown;
            until?: unknown;
          })
        : {};
    const actor =
      typeof parsedBody.actor === "string" && parsedBody.actor.trim().length > 0
        ? parsedBody.actor.trim()
        : "system";
    let suppressUntil: string | null = null;
    if (
      typeof parsedBody.until === "string" &&
      parsedBody.until.trim().length > 0
    ) {
      const parsedUntilMs = Date.parse(parsedBody.until);
      if (!Number.isNaN(parsedUntilMs)) {
        suppressUntil = new Date(parsedUntilMs).toISOString();
      }
    }
    if (!suppressUntil && typeof parsedBody.duration_seconds === "number") {
      suppressUntil = new Date(
        Date.now() +
          Math.max(1, Math.floor(parsedBody.duration_seconds)) * 1000,
      ).toISOString();
    }
    if (!suppressUntil) {
      ctx.sendError(res, 400, requestId, {
        code: "invalid_request",
        message:
          "Suppression requires either a valid `until` timestamp or `duration_seconds`.",
        retryable: false,
      });
      return true;
    }
    const updated: AlertRecord = {
      ...existing,
      suppressed_until: suppressUntil,
      suppressed_by: actor,
    };
    ctx.alertState.set(alertId, updated);
    ctx.persistAlertState();
    ctx.sendJson(res, 200, { alert: updated }, requestId);
    return true;
  }

  if (req.method === "GET" && requestUrlString.startsWith("/metrics?")) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const tenantId = requestUrl.searchParams.get("tenant_id");
    const taskSource = tenantId
      ? ctx.app.taskStore.listByTenant(tenantId)
      : ctx.app.taskStore.list();
    const taskStatusCounts = taskSource.reduce<Record<string, number>>(
      (acc, task) => {
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const taskCapabilityCounts = taskSource.reduce<Record<string, number>>(
      (acc, task) => {
        acc[task.capability] = (acc[task.capability] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const taskAgentCounts = taskSource.reduce<Record<string, number>>(
      (acc, task) => {
        acc[task.target_agent] = (acc[task.target_agent] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const queueStats = ctx.app.asyncQueue.getStats();
    const requestMetrics = ctx.getRequestMetrics();
    const deadLetterCount = tenantId
      ? ctx.app.asyncQueue.listDeadLettersByTenant(tenantId).length
      : ctx.app.asyncQueue.listDeadLetters().length;
    const alerts = ctx.getAlerts(requestMetrics, queueStats, deadLetterCount);
    const tenantReceipts = tenantId
      ? ctx.app.receiptStore.list(tenantId)
      : ctx.app.receiptStore.list();
    const signingKeyUsage = ctx.collectSigningKeyUsageForData({
      descriptors: ctx.app.registry.list(),
      receipts: tenantReceipts,
      checkpoints: ctx.auditCheckpoints,
    });
    const signingAnomalies = ctx.collectSigningAnomalies(signingKeyUsage);
    ctx.sendJson(
      res,
      200,
      {
        metrics: {
          queue: {
            ...queueStats,
            dead_letter_count: deadLetterCount,
          },
          tasks: {
            total: taskSource.length,
            by_status: taskStatusCounts,
            by_capability: taskCapabilityCounts,
            by_agent: taskAgentCounts,
          },
          requests: requestMetrics,
          latencies: {
            by_capability: ctx.getCapabilityLatencyMetrics(),
          },
          signing: {
            key_usage: signingKeyUsage,
            anomalies: signingAnomalies,
          },
          alerts,
        },
      },
      requestId,
    );
    return true;
  }

  if (req.method === "GET" && requestUrlString.startsWith("/agents?")) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const capability = requestUrl.searchParams.get("capability");
    const domain = requestUrl.searchParams.get("domain");
    const agents = capability
      ? ctx.app.registry.findByCapability(capability)
      : domain
        ? ctx.app.registry.findByDomain(domain)
        : ctx.app.registry.list();
    ctx.sendJson(res, 200, { agents }, requestId);
    return true;
  }

  if (
    req.method === "GET" &&
    requestUrlString.match(/^\/tasks\/[^/]+\/stream$/)
  ) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const pathParts = requestUrl.pathname.split("/");
    const taskId = decodeURIComponent(pathParts[2]);
    const tenantId = requestUrl.searchParams.get("tenant_id");
    const cursor = requestUrl.searchParams.get("cursor");

    const task = tenantId
      ? ctx.app.taskStore.getByTenant(taskId, tenantId)
      : ctx.app.orchestrator.getTask(taskId);
    if (!task) {
      ctx.sendError(res, 404, requestId, {
        code: "task_not_found",
        message: `Task not found: ${taskId}`,
        retryable: false,
      });
      return true;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Map-Request-Id": requestId,
    });

    const sendEvent = (eventType: string, data: unknown) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const taskState = {
      task_id: task.task_id,
      status: task.status,
      capability: task.capability,
      target_agent: task.target_agent,
      updated_at: task.updated_at,
    };

    sendEvent("status", { ...taskState, event: "status" });

    if (task.status === "completed" && task.result) {
      sendEvent("result", { task_id: task.task_id, result: task.result });
    }

    let lastStatus = task.status;
    let lastUpdatedAt = task.updated_at;

    const heartbeatInterval = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000);

    const checkInterval = setInterval(() => {
      const currentTask = tenantId
        ? ctx.app.taskStore.getByTenant(taskId, tenantId)
        : ctx.app.orchestrator.getTask(taskId);
      if (!currentTask) {
        clearInterval(heartbeatInterval);
        clearInterval(checkInterval);
        sendEvent("error", {
          code: "task_not_found",
          message: "Task no longer exists",
        });
        res.end();
        return;
      }

      if (
        currentTask.status !== lastStatus ||
        currentTask.updated_at !== lastUpdatedAt
      ) {
        const updatedState = {
          task_id: currentTask.task_id,
          status: currentTask.status,
          capability: currentTask.capability,
          target_agent: currentTask.target_agent,
          updated_at: currentTask.updated_at,
        };
        sendEvent("status", { ...updatedState, event: "status" });
        lastStatus = currentTask.status;
        lastUpdatedAt = currentTask.updated_at;

        if (currentTask.status === "completed" && currentTask.result) {
          sendEvent("result", {
            task_id: currentTask.task_id,
            result: currentTask.result,
          });
          clearInterval(heartbeatInterval);
          clearInterval(checkInterval);
          res.end();
          return;
        }
      }
    }, 1000);

    req.on("close", () => {
      clearInterval(heartbeatInterval);
      clearInterval(checkInterval);
    });

    return true;
  }

  if (req.method === "GET" && requestUrlString.match(/^\/tasks\/[^/]+$/)) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const pathParts = requestUrl.pathname.split("/");
    const taskId = decodeURIComponent(pathParts[2]);
    const tenantId = requestUrl.searchParams.get("tenant_id");
    const historyLengthRaw = requestUrl.searchParams.get("history_length");
    const historyLength =
      historyLengthRaw !== null
        ? parsePositiveIntOrDefault(historyLengthRaw, 0)
        : undefined;
    const task = tenantId
      ? ctx.app.taskStore.getByTenant(taskId, tenantId, historyLength)
      : ctx.app.orchestrator.getTask(taskId);
    if (!task) {
      ctx.sendError(res, 404, requestId, {
        code: "task_not_found",
        message: `Task not found: ${taskId}`,
        retryable: false,
      });
      return true;
    }
    ctx.sendJson(res, 200, { task }, requestId);
    return true;
  }

  if (req.method === "GET" && requestUrlString.startsWith("/receipts/")) {
    const requestUrl = new URL(requestUrlString, "http://localhost");
    const receiptId = decodeURIComponent(
      requestUrl.pathname.slice("/receipts/".length),
    );
    const tenantId = requestUrl.searchParams.get("tenant_id");
    const receipt = tenantId
      ? ctx.app.receiptStore.get(receiptId, tenantId)
      : ctx.app.receiptStore.get(receiptId);
    if (!receipt) {
      ctx.sendError(res, 404, requestId, {
        code: "receipt_not_found",
        message: `Receipt not found: ${receiptId}`,
        retryable: false,
      });
      return true;
    }
    ctx.sendJson(res, 200, { receipt }, requestId);
    return true;
  }

  return false;
}
