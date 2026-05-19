/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MAP Server — main entry point.
 *
 * Assembles configuration, persistence, services, middleware, and routes
 * into a single `createMapServer()` export.
 *
 * Route dispatch order:
 *  1. Read routes   (handled by read-routes.ts)
 *  2. Admin routes  (handled by admin-routes.ts)
 *  3. Policy routes (handled by policy-routes.ts)
 *  4. Task cancel   (inline)
 *  5. Mutation routes (handled by mutation-routes.ts)
 *  6. 404 fallback
 */

import { createServer as createHttpsServer } from "node:https";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import { createReferenceApp } from "../app.js";
import { createExampleAgents } from "../fixtures/agents.js";
import { resolveServerOptionsFromEnv } from "./config.js";
import type { MapHttpServerOptions } from "./types.js";

// Re-export config helper
export { resolveServerOptionsFromEnv };

// Re-export types for consumers
export type {
  MapHttpServerOptions,
  PersistedMetricsState,
  PersistedRateLimitState,
  RuntimeControlState,
  DeploymentProfileEvaluation,
  AlertRecord,
  AuditEvent,
  AuditCheckpoint,
} from "./types.js";

// ── HTTP helpers ────────────────────────────────────────────────────────────
import {
  readJsonBody as parseJsonBody,
  sendError as sendErrorResponse,
  sendJson as sendJsonResponse,
} from "./http.js";

// ── Utilities ───────────────────────────────────────────────────────────────
import {
  clampRatio,
  extractTargetAgent,
  extractTenantId,
  normalizePath,
  parsePositiveIntOrDefault,
  wantsSignedRequestAuth,
} from "./utils.js";

// ── State persistence ───────────────────────────────────────────────────────
import {
  hydrateAllState,
  persistRuntimeControls,
  persistRateLimitState,
  persistAlertState,
  persistAuditEvents,
  persistMetricsState as persistMetricsStateToDisk,
  type StatePersistenceOptions,
  type AllRuntimeState,
} from "./state.js";

// ── Services ────────────────────────────────────────────────────────────────
import { MetricsManager } from "./services/metrics-manager.js";
import { AuditManager } from "./services/audit-manager.js";
import { SigningAnomalyDetector } from "./services/signing-anomaly-detector.js";
import { RateLimiter } from "./services/rate-limiter.js";
import {
  AlertService,
  type AlertServiceDependencies,
} from "./services/alerts.js";

// ── Security ────────────────────────────────────────────────────────────────
import {
  getSignatureKeyId,
  getActiveSignatureKeyId,
  getSigningProviderStatus,
  getVerificationKeys,
  getTrustMetadata,
  signAuditCheckpoint,
  signAuditExport,
  signConformanceExport,
  signTrustBundle,
  verifyAuditCheckpointSignature,
} from "../security/signing.js";

// ── Auth ────────────────────────────────────────────────────────────────────
import {
  getRequiredAuthScheme,
  getSignedRequestError,
  getBearerTokenError,
} from "./middleware/auth.js";

// ── Validation ──────────────────────────────────────────────────────────────
import {
  validateApprovalRequest,
  validateDispatchRequest,
} from "../validation/schema-validator.js";

// ── Route handlers (existing files, to be gradually migrated to controllers) ─
import { handleReadRoutes } from "./read-routes.js";
import { handleMutationRoutes } from "./mutation-routes.js";
import { handleAdminRoutes } from "./admin-routes.js";
import { handlePolicyRoutes } from "./policy-routes.js";

// Re-export checkWritableFilePath for backward-compat
export { checkWritableFilePath } from "./persistence.js";

// ═════════════════════════════════════════════════════════════════════════════
// createMapHandler
// ═════════════════════════════════════════════════════════════════════════════

const ERROR_CODE_PATTERNS: [RegExp, string][] = [
  [/No micro-agent found/, "agent_not_found"],
  [/Target agent is disabled in registry/, "agent_disabled"],
  [/Capability not supported/, "capability_not_found"],
  [/Capability is disabled for target agent/, "capability_disabled"],
  [/Approval task not found/, "task_not_found"],
  [/Task not found/, "task_not_found"],
  [/Receipt not found/, "receipt_not_found"],
  [/not awaiting approval/, "approval_required"],
  [/Invalid approval reference/, "invalid_request"],
  [/Task id conflict|Idempotency key conflict/, "idempotency_conflict"],
  [/Async queue capacity exceeded/, "rate_limited"],
  [/tenant_id is required/, "policy_denied"],
  [/Task denied/, "policy_denied"],
  [/Unsupported schema version/, "schema_version_unsupported"],
  [/Unsupported output mode/, "unsupported_output_mode"],
  [/Invalid task state transition|Terminal task state|Task lifecycle invariant violated/, "invalid_request"],
  [/No adapter for capability/, "invalid_request"],
  [/Negotiation delivery mode conflicts/, "invalid_request"],
  [/requires approval/, "approval_required"],
  [/replay detected/, "invalid_auth"],
  [/Delegation token has expired/, "token_expired"],
  [/Invalid MAP/, "invalid_request"],
  [/Approval request/, "invalid_request"],
];

function classifyErrorCode(message: string): string {
  for (const [pattern, code] of ERROR_CODE_PATTERNS) {
    if (pattern.test(message)) return code;
  }
  return "request_failed";
}

export function createMapHandler(options: MapHttpServerOptions = {}) {
  const deploymentProfile = options.deploymentProfile ?? "open";

  // ── Reference app ──────────────────────────────────────────────────────
  const app = createReferenceApp({
    taskStorePath: options.taskStorePath,
    taskStoreDbPath: options.taskStoreDbPath,
    receiptStorePath: options.receiptStorePath,
    receiptStoreDbPath: options.receiptStoreDbPath,
    requireTenant: options.requireTenant,
    asyncQueueMaxAttempts: options.asyncQueueMaxAttempts,
    asyncQueueRetryDelayMs: options.asyncQueueRetryDelayMs,
    asyncQueueMaxRetryDelayMs: options.asyncQueueMaxRetryDelayMs,
    asyncQueueRetryJitterRatio: options.asyncQueueRetryJitterRatio,
    asyncQueueMaxConcurrent: options.asyncQueueMaxConcurrent,
    asyncQueueMaxConcurrentPerTenant: options.asyncQueueMaxConcurrentPerTenant,
    asyncQueueMaxQueueDepth: options.asyncQueueMaxQueueDepth,
    deadLetterStorePath: options.deadLetterStorePath,
    asyncQueueMaxDeadLetters: options.asyncQueueMaxDeadLetters,
    agents: options.agents ?? createExampleAgents(),
    policyFilePath: options.policyFilePath,
    approvalWebhookUrl: options.approvalWebhookUrl,
    serverBaseUrl: options.serverBaseUrl,
  });

  // ── Configuration ──────────────────────────────────────────────────────
  const metricsWindowMs = Math.max(1, options.metricsWindowMs ?? 5 * 60 * 1000);
  const rateLimitWindowMs = Math.max(1, options.rateLimitWindowMs ?? 60_000);
  const maxLatencySamplesPerCapability = Math.max(
    10,
    options.metricsMaxLatencySamplesPerCapability ?? 200,
  );
  const auditMaxEvents = Math.max(1, options.auditMaxEvents ?? 5_000);
  const auditCheckpointInterval = Math.max(
    1,
    options.auditCheckpointInterval ?? 100,
  );
  const signingRetiringKeyCriticalRatio = clampRatio(
    options.signingRetiringKeyCriticalRatio ?? 0.2,
  );
  const signingUnknownKeyCriticalRatio = clampRatio(
    options.signingUnknownKeyCriticalRatio ?? 0,
  );
  const taskStorePersistencePath =
    options.taskStoreDbPath ?? options.taskStorePath;
  const receiptStorePersistencePath =
    options.receiptStoreDbPath ?? options.receiptStorePath;

  // ── Hydrate all persisted state ────────────────────────────────────────
  const stateOpts: StatePersistenceOptions = {
    runtimeControlStorePath: options.runtimeControlStorePath,
    rateLimitStatePath: options.rateLimitStatePath,
    rateLimitWindowMs,
    alertStorePath: options.alertStorePath,
    auditStorePath: options.auditStorePath,
    auditMaxEvents,
    metricsStorePath: options.metricsStorePath,
    metricsWindowMs,
  };
  const state: AllRuntimeState = hydrateAllState(stateOpts);

  const {
    disabledAgents,
    disabledCapabilities,
    revokedSigningKeys,
    globalRateLimitEvents,
    tenantRateLimitEvents,
    alertState,
    auditEvents,
    auditCheckpoints,
    metricsState: hydratedMetrics,
  } = state;

  // ── Metrics & SLO Manager ──────────────────────────────────────────────
  const metricsManager = new MetricsManager({
    metricsWindowMs,
    maxLatencySamplesPerCapability,
    metricsStorePath: options.metricsStorePath,
    hydratedState: hydratedMetrics,
  });
  const metrics = metricsManager.metrics;
  const sloMonitor = metricsManager.sloMonitor;

  function persistMetrics(): void {
    metricsManager.persist();
  }

  function persistSLOMetrics(): void {
    // Persisted automatically via metricsManager.persist()
  }

  // ── Other Managers ─────────────────────────────────────────────────────
  const auditManager = new AuditManager({
    auditStorePath: options.auditStorePath,
    auditMaxEvents,
    auditCheckpointInterval,
    hydratedEvents: auditEvents,
    hydratedCheckpoints: auditCheckpoints,
  });

  const signingAnomalyDetector = new SigningAnomalyDetector({
    signingRetiringKeyCriticalRatio,
    signingUnknownKeyCriticalRatio,
  });

  const rateLimiter = new RateLimiter({
    rateLimitStatePath: options.rateLimitStatePath,
    rateLimitWindowMs,
    rateLimitMaxRequests: options.rateLimitMaxRequests,
    rateLimitMaxRequestsPerTenant: options.rateLimitMaxRequestsPerTenant,
    hydratedGlobalEvents: globalRateLimitEvents,
    hydratedTenantEvents: tenantRateLimitEvents,
  });

  // ── Alert service ──────────────────────────────────────────────────────
  const alertDeps: AlertServiceDependencies = {
    getQueueStats: () => app.asyncQueue.getStats() as any,
    getRequestMetrics: () => metricsManager.getRequestMetrics(),
    listDeadLettersByTenant: (tenantId: string) =>
      app.asyncQueue.listDeadLettersByTenant(tenantId),
    listReceiptsByTenant: (tenantId?: string) =>
      app.receiptStore.list(tenantId) as any,
    listRegistryDescriptors: () => app.registry.list() as any,
    getAuditCheckpoints: () => auditManager.getCheckpoints() as any,
    collectSigningAnomalies: (usage: any) => collectSigningAnomalies(usage),
    collectSigningKeyUsageForData: (input: any) =>
      collectSigningKeyUsageForData(input as any),
    healthMaxDeadLetters: options.healthMaxDeadLetters,
    healthMaxOldestDeadLetterAgeMs: options.healthMaxOldestDeadLetterAgeMs,
    metricsFailureRateThreshold: options.metricsFailureRateThreshold,
    getSLOAlerts: () =>
      sloMonitor.checkAlerts().map((a) => ({
        id: a.id,
        source: "slo" as const,
        code: a.code,
        severity: a.severity,
        message: a.message,
        recommended_action: a.recommended_action,
        slo_name: a.slo_name,
        budget_remaining_percent: a.budget_remaining_percent,
      })),
  };
  const alertService = new AlertService(alertDeps, alertState);

  function persistAlerts(): void {
    if (!options.alertStorePath) return;
    persistAlertState(options.alertStorePath, alertService.getAlertState());
  }

  // ── Helper: hash token ─────────────────────────────────────────────────
  function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  // ── Runtime control helpers ────────────────────────────────────────────
  function persistRtControls(): void {
    persistRuntimeControls(
      options.runtimeControlStorePath,
      disabledAgents,
      disabledCapabilities,
      revokedSigningKeys,
    );
  }

  function getEffectiveRevokedKeyIds(): Set<string> {
    const fromEnv = process.env.MAP_SIGNING_REVOKED_KIDS;
    if (fromEnv && fromEnv.trim().length > 0) {
      return new Set(
        fromEnv
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      );
    }
    return new Set<string>(revokedSigningKeys.keys());
  }

  function getEffectiveVerificationKeys() {
    return signingAnomalyDetector.getEffectiveVerificationKeys(getEffectiveRevokedKeyIds());
  }

  function getRuntimeRevocationMetadata(
    keyId: string,
  ): { revoked_at: string; revoked_by: string; reason?: string } | null {
    return revokedSigningKeys.get(keyId) ?? null;
  }

  function evaluateDeploymentProfile() {
    return signingAnomalyDetector.evaluateDeploymentProfile({
      deploymentProfile,
      enforceSignedRequests: options.enforceSignedRequests,
      requireTenant: options.requireTenant,
      revokedKids: getEffectiveRevokedKeyIds(),
    });
  }

  function isAgentDisabled(agentId: string): boolean {
    return disabledAgents.has(agentId);
  }

  function isCapabilityDisabled(agentId: string, capability: string): boolean {
    return Boolean(disabledCapabilities.get(agentId)?.has(capability));
  }

  function snapshotRuntimeControls() {
    return {
      disabled_agents: Object.fromEntries(disabledAgents.entries()),
      disabled_capabilities: Object.fromEntries(
        Array.from(disabledCapabilities.entries()).map(
          ([agentId, capabilities]) => [
            agentId,
            Object.fromEntries(capabilities.entries()),
          ],
        ),
      ),
      revoked_keys: Object.fromEntries(revokedSigningKeys.entries()),
    };
  }

  // ── Audit chain ────────────────────────────────────────────────────────
  function recordAuditEvent(event: Parameters<AuditManager["recordAuditEvent"]>[0]): void {
    auditManager.recordAuditEvent(event);
  }

  function verifyAuditIntegrity() {
    return auditManager.verifyAuditIntegrity();
  }

  // ── Signing key usage & anomaly detection ──────────────────────────────
  function collectSigningKeyUsage() {
    return signingAnomalyDetector.collectSigningKeyUsage({
      descriptors: app.registry.list(),
      receipts: app.receiptStore.list(),
      checkpoints: auditManager.getCheckpoints(),
    });
  }

  function collectSigningKeyUsageForData(input: Parameters<SigningAnomalyDetector["collectSigningKeyUsage"]>[0]) {
    return signingAnomalyDetector.collectSigningKeyUsage(input);
  }

  function collectSigningAnomalies(signingUsage: Parameters<SigningAnomalyDetector["collectSigningAnomalies"]>[0]) {
    return signingAnomalyDetector.collectSigningAnomalies(
      signingUsage,
      getEffectiveRevokedKeyIds(),
    );
  }

  // ── Rate limiting ──────────────────────────────────────────────────────
  function checkMutationRateLimit(tenantId?: string) {
    return rateLimiter.checkMutationRateLimit(tenantId);
  }

  // ── HTTP JSON helpers (wrapping http.ts with metrics recording) ────────
  function sendJson(
    res: ServerResponse,
    statusCode: number,
    body: unknown,
    requestId: string,
    tracking: { ok: boolean; errorCode?: string; targetAgent?: string } = {
      ok: true,
    },
    extraHeaders?: Record<string, string>,
  ): void {
    sendJsonResponse(
      res,
      statusCode,
      body,
      requestId,
      (ok, errorCode, targetAgent) => {
        metrics.recordRequest(ok, errorCode, targetAgent);
        sloMonitor.recordMetric("dispatch.success_rate", ok ? 0 : 1);
      },
      tracking,
      extraHeaders,
    );
  }

  function sendError(
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
  ): void {
    sendErrorResponse(
      res,
      statusCode,
      requestId,
      error,
      (ok, errorCode, targetAgent) => {
        metrics.recordRequest(ok, errorCode, targetAgent);
        sloMonitor.recordMetric("dispatch.success_rate", ok ? 0 : 1);
      },
      targetAgent,
    );
  }

  async function readJsonBody(
    req: IncomingMessage,
  ): Promise<{ raw: string; parsed: unknown }> {
    return parseJsonBody(req);
  }

  async function getAdminTokenError(
    req: IncomingMessage,
    rawBody: string,
  ): Promise<{ statusCode: number; code: string; message: string } | null> {
    const configuredToken = process.env.MAP_ADMIN_TOKEN;
    const configuredHash =
      configuredToken && configuredToken.trim().length > 0
        ? hashToken(configuredToken)
        : null;

    if (!configuredHash) {
      return {
        statusCode: 403,
        code: "invalid_auth",
        message: "Admin controls are not enabled.",
      };
    }

    const providedToken = req.headers["x-map-admin-token"];
    if (
      typeof providedToken !== "string" ||
      hashToken(providedToken) !== configuredHash
    ) {
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
      return {
        statusCode: 403,
        code: "invalid_auth",
        message: "Invalid admin token.",
      };
    }

    const signedRequestError = getSignedRequestError(
      req,
      rawBody,
      getEffectiveRevokedKeyIds(),
    );
    if (signedRequestError) {
      return {
        statusCode: signedRequestError.code === "auth_required" ? 401 : 403,
        code: signedRequestError.code,
        message: signedRequestError.message,
      };
    }

    return null;
  }

  // ── Get alerts helper ──────────────────────────────────────────────────
  function getAlerts(
    requestMetrics: ReturnType<typeof metrics.getRequestMetrics>,
    queueStats: ReturnType<typeof app.asyncQueue.getStats>,
    deadLetterCount: number,
  ) {
    const deadLetterCountThreshold = options.healthMaxDeadLetters;
    const oldestDeadLetterAgeThreshold = options.healthMaxOldestDeadLetterAgeMs;
    const failureRateThreshold = options.metricsFailureRateThreshold;
    const thresholds: Record<string, number | undefined> = {};
    if (typeof deadLetterCountThreshold === "number") {
      thresholds.dead_letter_count = deadLetterCountThreshold;
    }
    if (typeof oldestDeadLetterAgeThreshold === "number") {
      thresholds.oldest_dead_letter_age_ms = oldestDeadLetterAgeThreshold;
    }
    if (typeof failureRateThreshold === "number") {
      thresholds.request_failure_rate_window = failureRateThreshold;
    }

    return {
      thresholds,
      breaches: {
        dead_letter_count_exceeded:
          typeof deadLetterCountThreshold === "number" &&
          deadLetterCount > deadLetterCountThreshold,
        oldest_dead_letter_age_exceeded:
          typeof oldestDeadLetterAgeThreshold === "number" &&
          typeof queueStats.oldest_dead_letter_age_ms === "number" &&
          queueStats.oldest_dead_letter_age_ms > oldestDeadLetterAgeThreshold,
        request_failure_rate_exceeded:
          typeof failureRateThreshold === "number" &&
          requestMetrics.failure_rate_window > failureRateThreshold,
      },
    };
  }

  // ── Periodic outbox processor ──────────────────────────────────────────
  const outboxInterval = setInterval(() => {
    app.asyncQueue.processOutbox();
    // Record dead letter rate for SLO tracking
    const stats = app.asyncQueue.getStats();
    const deadLetterRate =
      stats.queue_depth > 0 ? stats.dead_letter_count / stats.queue_depth : 0;
    sloMonitor.recordMetric("async_queue.dead_letter_rate", deadLetterRate);
  }, 5_000);
  outboxInterval.unref();

  // ═══════════════════════════════════════════════════════════════════════
  // Main request handler
  // ═══════════════════════════════════════════════════════════════════════

  return async (req: IncomingMessage, res: ServerResponse) => {
    const headerRequestId = req.headers["x-map-request-id"];
    const requestId =
      typeof headerRequestId === "string" && headerRequestId.trim().length > 0
        ? headerRequestId
        : randomUUID();

    let routeTargetAgent: string | undefined;
    let routeTenantId: string | undefined;
    try {
      if (!req.url || !req.method) {
        sendError(res, 400, requestId, {
          code: "invalid_request",
          message: "Missing request metadata.",
          retryable: false,
        });
        return;
      }

      // ── 0. SLO endpoint ──────────────────────────────────────────────
      if (req.method === "GET" && req.url === "/slo") {
        const budgets: Record<string, unknown> = {};
        for (const [name, budget] of sloMonitor.getAllBudgets()) {
          budgets[name] = budget;
        }
        const sloAlerts = sloMonitor.checkAlerts();
        sendJson(
          res,
          200,
          {
            slos: budgets,
            alerts: sloAlerts,
            timestamp: new Date().toISOString(),
          },
          requestId,
        );
        return;
      }

      // ── 1. Read routes ────────────────────────────────────────────────
      const readRouteHandled = await handleReadRoutes({
        req,
        res,
        requestId,
        deploymentProfile,
        options,
        app,
        metricsWindowMs,
        rateLimitWindowMs,
        maxLatencySamplesPerCapability,
        auditMaxEvents,
        auditCheckpointInterval,
        signingRetiringKeyCriticalRatio,
        signingUnknownKeyCriticalRatio,
        taskStorePersistencePath,
        receiptStorePersistencePath,
        auditEvents,
        auditCheckpoints,
        alertState,
        getEffectiveVerificationKeys,
        evaluateDeploymentProfile,
        verifyAuditIntegrity,
        collectSigningKeyUsage,
        collectSigningKeyUsageForData,
        collectSigningAnomalies,
        getRequestMetrics: () => ({
          ...metrics.getRequestMetrics(),
          errors: metrics.getErrorBreakdown(),
        }),
        getAlerts,
        getCapabilityLatencyMetrics: () =>
          metrics.getCapabilityLatencyMetrics(),
        getActiveAlerts: (tenantId?: string) =>
          alertService.getActiveAlerts(tenantId),
        persistAlertState: () => persistAlerts(),
        sendJson,
        sendError,
        readJsonBody,
        snapshotRuntimeControls,
        getAdminTokenError,
        getRuntimeRevocationMetadata,
      });
      if (readRouteHandled) return;

      // ── 2. Admin routes ───────────────────────────────────────────────
      const adminRouteHandled = await handleAdminRoutes({
        req,
        res,
        requestId,
        deploymentProfile,
        sendJson,
        sendError,
        readJsonBody,
        getAdminTokenError,
        snapshotRuntimeControls,
        getEffectiveVerificationKeys,
        getRuntimeRevocationMetadata,
        disabledAgents,
        disabledCapabilities,
        revokedSigningKeys,
        persistRuntimeControls: persistRtControls,
        recordAuditEvent,
      });
      if (adminRouteHandled) return;

      // ── 3. Policy routes ──────────────────────────────────────────────
      const policyRouteHandled = await handlePolicyRoutes({
        req,
        res,
        requestId,
        app,
        readJsonBody,
        sendJson,
        sendError,
        recordAuditEvent,
        policyFilePath: options.policyFilePath,
      });
      if (policyRouteHandled) return;

      // ── 4. Task cancellation ──────────────────────────────────────────
      if (
        req.method === "POST" &&
        req.url?.startsWith("/tasks/") &&
        req.url?.endsWith("/cancel")
      ) {
        const taskId = req.url.slice(
          "/tasks/".length,
          req.url.length - "/cancel".length,
        );
        if (!taskId || taskId.includes("/")) {
          sendError(res, 400, requestId, {
            code: "invalid_request",
            message: "Invalid task ID in cancel path.",
            retryable: false,
          });
          return;
        }

        const tenantId =
          typeof req.headers["x-map-tenant-id"] === "string"
            ? req.headers["x-map-tenant-id"]
            : undefined;

        try {
          const result = app.orchestrator.cancelTask(taskId, tenantId);
          recordAuditEvent({
            timestamp: new Date().toISOString(),
            request_id: requestId,
            code: "task_cancelled",
            message: `Task ${taskId} was cancelled.`,
            method: req.method,
            route: `/tasks/${taskId}/cancel`,
            tenant_id: tenantId,
            target_agent: result.result.structured_output?.target_agent as
              | string
              | undefined,
          });
          sendJson(res, 200, result, requestId);
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Unknown error cancelling task.";
          if (message.includes("Task not found")) {
            sendError(res, 404, requestId, {
              code: "task_not_found",
              message,
              retryable: false,
            });
            return;
          }
          sendError(res, 409, requestId, {
            code: "invalid_request",
            message,
            retryable: false,
          });
        }
        return;
      }

      // ── 4. Mutation routes ────────────────────────────────────────────
      const mutationRouteResult = await handleMutationRoutes({
        req,
        res,
        requestId,
        routeTargetAgent,
        routeTenantId,
        options,
        app,
        disabledAgents,
        disabledCapabilities,
        isAgentDisabled,
        isCapabilityDisabled,
        readJsonBody,
        validateDispatchRequest,
        validateApprovalRequest,
        getEffectiveRevokedKeyIds,
        getBearerTokenError,
        checkMutationRateLimit,
        asyncQueueMaxQueueDepth: app.asyncQueue.getStats().max_queue_depth,
        getAsyncQueueDepth: () => app.asyncQueue.getStats().queue_depth,
        recordAuditEvent,
        recordCapabilityLatency: (cap: string, dur: number) => {
          metrics.recordCapabilityLatency(cap, dur);
          sloMonitor.recordMetric("dispatch.latency_p95_ms", dur);
        },
        sendJson,
        sendError,
      });
      routeTargetAgent = mutationRouteResult.routeTargetAgent;
      routeTenantId = mutationRouteResult.routeTenantId;
      if (mutationRouteResult.handled) {
        persistMetrics();
        persistAlerts();
        persistSLOMetrics();
        return;
      }

      // ── 5. 404 fallback ───────────────────────────────────────────────
      sendError(
        res,
        404,
        requestId,
        {
          code: "not_found",
          message: "Route not found.",
          retryable: false,
        },
        routeTargetAgent,
      );
    } catch (error) {
      const originalMessage =
        error instanceof Error ? error.message : "Unknown server error.";
      const code = classifyErrorCode(originalMessage);

      console.error("MAP internal error:", originalMessage, {
        requestId,
        code,
      });

      const retryable = code === "request_failed" || code === "rate_limited";
      if (code === "policy_denied" || code === "invalid_auth") {
        recordAuditEvent({
          timestamp: new Date().toISOString(),
          request_id: requestId,
          code,
          message: originalMessage,
          method: req.method ?? "UNKNOWN",
          route: normalizePath(req.url ?? "/"),
          tenant_id: routeTenantId,
          target_agent: routeTargetAgent,
        });
      }
      const statusCode =
        code === "rate_limited"
          ? 429
          : code === "idempotency_conflict"
            ? 409
            : code === "capability_not_found"
              ? 404
              : 400;

      sendError(
        res,
        statusCode,
        requestId,
        {
          code,
          message: "The requested operation could not be completed.",
          retryable,
          details: {
            category:
              code === "idempotency_conflict"
                ? "conflict"
                : code === "rate_limited"
                  ? "throttling"
                  : code === "policy_denied" || code === "approval_required"
                    ? "policy"
                    : code === "schema_version_unsupported"
                      ? "versioning"
                      : code === "unsupported_output_mode"
                        ? "capability"
                        : "runtime",
          },
        },
        routeTargetAgent,
      );
      persistMetrics();
      persistAlerts();
      persistSLOMetrics();
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// createMapServer
// ═════════════════════════════════════════════════════════════════════════════

export function createMapServer(options: MapHttpServerOptions = {}): Server {
  const handler = createMapHandler(options);
  if (options.certPath && options.keyPath) {
    const cert = readFileSync(options.certPath);
    const key = readFileSync(options.keyPath);
    const httpsOptions: {
      cert: Buffer;
      key: Buffer;
      requestCert?: boolean;
      rejectUnauthorized?: boolean;
      ca?: Buffer;
    } = { cert, key };
    if (options.mtls) {
      httpsOptions.requestCert = options.mtls.requestCert;
      httpsOptions.rejectUnauthorized = options.mtls.rejectUnauthorized;
      if (options.mtls.caPath) {
        httpsOptions.ca = readFileSync(options.mtls.caPath);
      }
    }
    return createHttpsServer(httpsOptions, handler) as unknown as Server;
  }
  return createServer(handler);
}
