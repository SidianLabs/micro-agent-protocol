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
import { MetricsService, createMetricsService } from "./services/metrics.js";
import {
  AlertService,
  type AlertServiceDependencies,
} from "./services/alerts.js";
import { SLOMonitor } from "./services/slo-monitor.js";

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

  // ── Metrics service ────────────────────────────────────────────────────
  const metrics = createMetricsService({
    metricsWindowMs,
    maxLatencySamplesPerCapability,
    metricsStorePath: options.metricsStorePath,
    hydratedState: hydratedMetrics,
  });

  function persistMetrics(): void {
    if (!options.metricsStorePath) return;
    const json = metrics.toJSON();
    persistMetricsStateToDisk(options.metricsStorePath, {
      requestsTotal: json.requests_total,
      requestsSucceeded: json.requests_succeeded,
      requestsFailed: json.requests_failed,
      requestEvents: json.request_events,
      errorsByCode: new Map(Object.entries(json.errors_by_code)),
      errorsByAgent: new Map(Object.entries(json.errors_by_agent)),
      errorsByAgentByCode: new Map(
        Object.entries(json.errors_by_agent_by_code).map(([agent, codes]) => [
          agent,
          new Map(Object.entries(codes)),
        ]),
      ),
      capabilityLatencySamples: new Map(
        Object.entries(json.capability_latency_samples).map(
          ([cap, samples]) => [cap, Array.isArray(samples) ? samples : []],
        ),
      ),
      metricsWindowMs,
    });
  }

  // ── SLO Monitor ──────────────────────────────────────────────────────
  const sloMonitor = new SLOMonitor();

  function persistSLOMetrics(): void {
    // SLO data is small and in-memory; persist alongside metrics if a metrics store path is set.
    if (!options.metricsStorePath) return;
    try {
      const sloJson = sloMonitor.toJSON();
      const sloPath = options.metricsStorePath.replace(/\.json$/, "-slo.json");
      mkdirSync(dirname(sloPath), { recursive: true });
      writeFileSync(sloPath, JSON.stringify(sloJson, null, 2), "utf8");
    } catch {
      // Non-critical – SLO persistence failure should not crash the server.
    }
  }

  // ── Alert service ──────────────────────────────────────────────────────
  const alertDeps: AlertServiceDependencies = {
    getQueueStats: () => app.asyncQueue.getStats() as any,
    getRequestMetrics: () => metrics.getRequestMetrics(),
    listDeadLettersByTenant: (tenantId: string) =>
      app.asyncQueue.listDeadLettersByTenant(tenantId),
    listReceiptsByTenant: (tenantId?: string) =>
      app.receiptStore.list(tenantId) as any,
    listRegistryDescriptors: () => app.registry.list() as any,
    getAuditCheckpoints: () => auditCheckpoints as any,
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

  function getEffectiveVerificationKeys(): ReturnType<
    typeof getVerificationKeys
  > {
    const revoked = getEffectiveRevokedKeyIds();
    return getVerificationKeys().map((key) =>
      revoked.has(key.kid) ? { ...key, status: "revoked" as const } : key,
    );
  }

  function getRuntimeRevocationMetadata(
    keyId: string,
  ): { revoked_at: string; revoked_by: string; reason?: string } | null {
    return revokedSigningKeys.get(keyId) ?? null;
  }

  function evaluateDeploymentProfile() {
    const violations: string[] = [];
    const verificationKeys = getEffectiveVerificationKeys();
    const signableKeys = verificationKeys.filter(
      (key) => key.status !== "revoked",
    );
    const activeKid = getActiveSignatureKeyId();
    const activeSignableKey =
      activeKid && activeKid.trim().length > 0
        ? signableKeys.find((key) => key.kid === activeKid)
        : undefined;

    if (deploymentProfile === "verified" || deploymentProfile === "regulated") {
      if (options.enforceSignedRequests !== true) {
        violations.push("signed_requests_not_enforced");
      }
      if (!activeSignableKey) {
        violations.push("active_signing_key_missing");
      }
      if (signableKeys.some((key) => key.demo_only)) {
        violations.push("demo_signing_keys_present");
      }
      if (!activeSignableKey || activeSignableKey.alg !== "RS256") {
        violations.push("active_key_not_rs256");
      }
      if (signableKeys.some((key) => key.alg !== "RS256")) {
        violations.push("non_asymmetric_signing_keys_present");
      }
    }
    if (deploymentProfile === "regulated") {
      if (options.requireTenant !== true) {
        violations.push("tenant_required_not_enforced");
      }
    }

    return {
      profile: deploymentProfile,
      compliant: violations.length === 0,
      violations,
    };
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
  function hashAuditEventBase(input: {
    timestamp: string;
    request_id: string;
    code: string;
    message: string;
    method: string;
    route: string;
    tenant_id?: string;
    target_agent?: string;
    chain_index: number;
    prev_event_hash: string;
  }): string {
    const canonical = [
      input.timestamp,
      input.request_id,
      input.code,
      input.message,
      input.method,
      input.route,
      input.tenant_id ?? "",
      input.target_agent ?? "",
      String(input.chain_index),
      input.prev_event_hash,
    ].join("|");
    return createHash("sha256").update(canonical).digest("hex");
  }

  function createAuditCheckpoint(lastEvent: {
    chain_index: number;
    event_hash: string;
  }): void {
    if (lastEvent.chain_index % auditCheckpointInterval !== 0) return;
    const checkpoint = {
      checkpoint_id: `audit-checkpoint:${lastEvent.chain_index}`,
      created_at: new Date().toISOString(),
      last_chain_index: lastEvent.chain_index,
      last_event_hash: lastEvent.event_hash,
      key_id: "",
      signature: "",
    };
    checkpoint.signature = signAuditCheckpoint({
      checkpoint_id: checkpoint.checkpoint_id,
      created_at: checkpoint.created_at,
      last_chain_index: checkpoint.last_chain_index,
      last_event_hash: checkpoint.last_event_hash,
    });
    checkpoint.key_id = getSignatureKeyId(checkpoint.signature) ?? "unknown";
    auditCheckpoints.push(checkpoint);
    if (auditCheckpoints.length > auditMaxEvents) {
      auditCheckpoints.splice(0, auditCheckpoints.length - auditMaxEvents);
    }
  }

  function recordAuditEvent(event: {
    timestamp: string;
    request_id: string;
    code: string;
    message: string;
    method: string;
    route: string;
    tenant_id?: string;
    target_agent?: string;
    subject?: string;
  }): void {
    const last = auditEvents[auditEvents.length - 1];
    const chainIndex = last ? last.chain_index + 1 : 1;
    const prevEventHash = last ? last.event_hash : "GENESIS";
    const eventHash = hashAuditEventBase({
      ...event,
      chain_index: chainIndex,
      prev_event_hash: prevEventHash,
    });
    const chainedEvent = {
      ...event,
      chain_index: chainIndex,
      prev_event_hash: prevEventHash,
      event_hash: eventHash,
    };
    auditEvents.push(chainedEvent);
    if (auditEvents.length > auditMaxEvents) {
      auditEvents.splice(0, auditEvents.length - auditMaxEvents);
    }
    createAuditCheckpoint(chainedEvent);
    persistAuditEvents(options.auditStorePath, auditEvents, auditCheckpoints);
  }

  function verifyAuditIntegrity(): {
    ok: boolean;
    errors: string[];
    summary: {
      events_checked: number;
      checkpoints_checked: number;
      latest_chain_index: number;
    };
  } {
    const errors: string[] = [];
    for (let index = 0; index < auditEvents.length; index += 1) {
      const current = auditEvents[index];
      const expectedIndex = index + 1;
      if (current.chain_index !== expectedIndex) {
        errors.push(
          `event_chain_index_mismatch_at_${index}: expected ${expectedIndex}, got ${current.chain_index}`,
        );
      }
      const expectedPrev =
        index === 0 ? "GENESIS" : auditEvents[index - 1].event_hash;
      if (current.prev_event_hash !== expectedPrev) {
        errors.push(`event_prev_hash_mismatch_at_${index}`);
      }
      const expectedHash = hashAuditEventBase({
        timestamp: current.timestamp,
        request_id: current.request_id,
        code: current.code,
        message: current.message,
        method: current.method,
        route: current.route,
        tenant_id: current.tenant_id,
        target_agent: current.target_agent,
        chain_index: current.chain_index,
        prev_event_hash: current.prev_event_hash,
      });
      if (current.event_hash !== expectedHash) {
        errors.push(`event_hash_mismatch_at_${index}`);
      }
    }
    for (let index = 0; index < auditCheckpoints.length; index += 1) {
      const checkpoint = auditCheckpoints[index];
      const checkpointKid = getSignatureKeyId(checkpoint.signature);
      if (checkpointKid !== checkpoint.key_id) {
        errors.push(`checkpoint_key_id_mismatch_at_${index}`);
      }
      const signatureOk = verifyAuditCheckpointSignature(
        {
          checkpoint_id: checkpoint.checkpoint_id,
          created_at: checkpoint.created_at,
          last_chain_index: checkpoint.last_chain_index,
          last_event_hash: checkpoint.last_event_hash,
        },
        checkpoint.signature,
      );
      if (!signatureOk) {
        errors.push(`checkpoint_signature_invalid_at_${index}`);
      }
      const targetEvent = auditEvents.find(
        (event) => event.chain_index === checkpoint.last_chain_index,
      );
      if (!targetEvent) {
        errors.push(`checkpoint_missing_chain_index_at_${index}`);
      } else if (targetEvent.event_hash !== checkpoint.last_event_hash) {
        errors.push(`checkpoint_event_hash_mismatch_at_${index}`);
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      summary: {
        events_checked: auditEvents.length,
        checkpoints_checked: auditCheckpoints.length,
        latest_chain_index:
          auditEvents[auditEvents.length - 1]?.chain_index ?? 0,
      },
    };
  }

  // ── Signing key usage & anomaly detection ──────────────────────────────
  function collectSigningKeyUsage() {
    return collectSigningKeyUsageForData({
      descriptors: app.registry.list(),
      receipts: app.receiptStore.list(),
      checkpoints: auditCheckpoints,
    });
  }

  function collectSigningKeyUsageForData(input: {
    descriptors: ReturnType<(typeof app.registry)["list"]>;
    receipts: ReturnType<(typeof app.receiptStore)["list"]>;
    checkpoints: typeof auditCheckpoints;
  }) {
    const descriptorCounts = input.descriptors.reduce<Record<string, number>>(
      (acc, descriptor) => {
        const keyId =
          typeof descriptor.descriptor_key_id === "string" &&
          descriptor.descriptor_key_id.length > 0
            ? descriptor.descriptor_key_id
            : "unknown";
        acc[keyId] = (acc[keyId] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const receiptCounts = input.receipts.reduce<Record<string, number>>(
      (acc, receipt) => {
        const keyId = getSignatureKeyId(receipt.signature) ?? "unknown";
        acc[keyId] = (acc[keyId] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const checkpointCounts = input.checkpoints.reduce<Record<string, number>>(
      (acc, checkpoint) => {
        const keyId = checkpoint.key_id || "unknown";
        acc[keyId] = (acc[keyId] ?? 0) + 1;
        return acc;
      },
      {},
    );
    return {
      agent_descriptors_by_key_id: descriptorCounts,
      receipts_by_key_id: receiptCounts,
      audit_checkpoints_by_key_id: checkpointCounts,
    };
  }

  function collectSigningAnomalies(signingUsage: {
    agent_descriptors_by_key_id: Record<string, number>;
    receipts_by_key_id: Record<string, number>;
    audit_checkpoints_by_key_id: Record<string, number>;
  }) {
    const verificationKeys = getEffectiveVerificationKeys();
    const retiringKeyIds = new Set(
      verificationKeys
        .filter((key) => key.status === "retiring")
        .map((key) => key.kid),
    );
    const allUsageEntries = [
      ...Object.entries(signingUsage.agent_descriptors_by_key_id),
      ...Object.entries(signingUsage.receipts_by_key_id),
      ...Object.entries(signingUsage.audit_checkpoints_by_key_id),
    ];

    const unknownKeyUsageDetected = allUsageEntries.some(
      ([keyId, count]) => keyId === "unknown" && Number(count) > 0,
    );
    const retiringKeyUsageDetected = allUsageEntries.some(
      ([keyId, count]) => retiringKeyIds.has(keyId) && Number(count) > 0,
    );
    const totalSignaturesAnalyzed = allUsageEntries.reduce(
      (acc, [, count]) => acc + Number(count),
      0,
    );
    const unknownKeyUsageCount = allUsageEntries.reduce(
      (acc, [keyId, count]) => acc + (keyId === "unknown" ? Number(count) : 0),
      0,
    );
    const retiringKeyUsageCount = allUsageEntries.reduce(
      (acc, [keyId, count]) =>
        acc + (retiringKeyIds.has(keyId) ? Number(count) : 0),
      0,
    );
    const unknownKeyUsageRatio =
      totalSignaturesAnalyzed > 0
        ? unknownKeyUsageCount / totalSignaturesAnalyzed
        : 0;
    const retiringKeyUsageRatio =
      totalSignaturesAnalyzed > 0
        ? retiringKeyUsageCount / totalSignaturesAnalyzed
        : 0;
    const unknownKeyRatioExceeded =
      unknownKeyUsageDetected &&
      unknownKeyUsageRatio > signingUnknownKeyCriticalRatio;
    const retiringKeyRatioExceeded =
      retiringKeyUsageDetected &&
      retiringKeyUsageRatio > signingRetiringKeyCriticalRatio;

    const severity: "ok" | "warning" | "critical" =
      unknownKeyRatioExceeded || retiringKeyRatioExceeded
        ? "critical"
        : retiringKeyUsageDetected
          ? "warning"
          : "ok";

    const recommendedAction =
      severity === "critical"
        ? "Investigate unknown signing key usage immediately and rotate active keys if compromise is suspected."
        : severity === "warning"
          ? "Monitor retiring key usage and complete signing key migration to active keys."
          : "No action required.";

    return {
      unknown_key_usage_detected: unknownKeyUsageDetected,
      retiring_key_usage_detected: retiringKeyUsageDetected,
      unknown_key_usage_ratio: unknownKeyUsageRatio,
      retiring_key_usage_ratio: retiringKeyUsageRatio,
      total_signatures_analyzed: totalSignaturesAnalyzed,
      thresholds: {
        unknown_key_critical_ratio: signingUnknownKeyCriticalRatio,
        retiring_key_critical_ratio: signingRetiringKeyCriticalRatio,
      },
      threshold_breaches: {
        unknown_key_ratio_exceeded: unknownKeyRatioExceeded,
        retiring_key_ratio_exceeded: retiringKeyRatioExceeded,
      },
      severity,
      recommended_action: recommendedAction,
    };
  }

  // ── Rate limiting ──────────────────────────────────────────────────────
  function consumeRateLimitSlot(
    events: number[],
    limit: number | undefined,
  ): { allowed: boolean; retryAfterMs: number } {
    if (typeof limit !== "number") return { allowed: true, retryAfterMs: 0 };

    const now = Date.now();
    let mutated = false;
    while (events.length > 0 && now - events[0] > rateLimitWindowMs) {
      events.shift();
      mutated = true;
    }

    if (events.length >= limit) {
      const oldest = events[0] ?? now;
      const retryAfterMs = Math.max(1, rateLimitWindowMs - (now - oldest));
      if (mutated) {
        persistRateLimitState(
          options.rateLimitStatePath,
          rateLimitWindowMs,
          globalRateLimitEvents,
          tenantRateLimitEvents,
        );
      }
      return { allowed: false, retryAfterMs };
    }

    events.push(now);
    mutated = true;
    if (mutated) {
      persistRateLimitState(
        options.rateLimitStatePath,
        rateLimitWindowMs,
        globalRateLimitEvents,
        tenantRateLimitEvents,
      );
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  function checkMutationRateLimit(tenantId?: string): {
    allowed: boolean;
    scope?: "global" | "tenant";
    retryAfterMs?: number;
  } {
    const globalLimit = consumeRateLimitSlot(
      globalRateLimitEvents,
      options.rateLimitMaxRequests,
    );
    if (!globalLimit.allowed) {
      return {
        allowed: false,
        scope: "global",
        retryAfterMs: globalLimit.retryAfterMs,
      };
    }

    if (tenantId && typeof options.rateLimitMaxRequestsPerTenant === "number") {
      const events = tenantRateLimitEvents.get(tenantId) ?? [];
      const tenantLimit = consumeRateLimitSlot(
        events,
        options.rateLimitMaxRequestsPerTenant,
      );
      tenantRateLimitEvents.set(tenantId, events);
      if (!tenantLimit.allowed) {
        return {
          allowed: false,
          scope: "tenant",
          retryAfterMs: tenantLimit.retryAfterMs,
        };
      }
    }

    return { allowed: true };
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
      const code = originalMessage.includes("No micro-agent found")
        ? "agent_not_found"
        : originalMessage.includes("Target agent is disabled in registry")
          ? "agent_disabled"
          : originalMessage.includes("Capability not supported")
            ? "capability_not_found"
            : originalMessage.includes(
                  "Capability is disabled for target agent",
                )
              ? "capability_disabled"
              : originalMessage.includes("Approval task not found")
                ? "task_not_found"
                : originalMessage.includes("Task not found")
                  ? "task_not_found"
                  : originalMessage.includes("Receipt not found")
                    ? "receipt_not_found"
                    : originalMessage.includes("not awaiting approval")
                      ? "approval_required"
                      : originalMessage.includes("Invalid approval reference")
                        ? "invalid_request"
                        : originalMessage.includes("Task id conflict") ||
                            originalMessage.includes("Idempotency key conflict")
                          ? "idempotency_conflict"
                          : originalMessage.includes(
                                "Async queue capacity exceeded",
                              )
                            ? "rate_limited"
                            : originalMessage.includes("tenant_id is required")
                              ? "policy_denied"
                              : originalMessage.includes("Task denied")
                                ? "policy_denied"
                                : originalMessage.includes(
                                      "Unsupported schema version",
                                    )
                                  ? "schema_version_unsupported"
                                  : originalMessage.includes(
                                        "Unsupported output mode",
                                      )
                                    ? "unsupported_output_mode"
                                    : originalMessage.includes(
                                          "Invalid task state transition",
                                        ) ||
                                        originalMessage.includes(
                                          "Terminal task state",
                                        ) ||
                                        originalMessage.includes(
                                          "Task lifecycle invariant violated",
                                        )
                                      ? "invalid_request"
                      : originalMessage.includes(
                            "No adapter for capability",
                          )
                            ? "invalid_request"
                            : originalMessage.includes(
                                  "Negotiation delivery mode conflicts",
                                )
                              ? "invalid_request"
                                        : originalMessage.includes(
                                              "requires approval",
                                            )
                                          ? "approval_required"
                                          : originalMessage.includes(
                                                "replay detected",
                                              )
                                            ? "invalid_auth"
                                            : originalMessage.includes(
                                                  "Approval request",
                                                )
                                              ? "invalid_request"
                                              : originalMessage.includes(
                                                    "Invalid MAP",
                                                  )
                                                ? "invalid_request"
                                                : originalMessage.includes(
                                                      "Delegation token has expired",
                                                    )
                                                  ? "token_expired"
                                                  : "request_failed";

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
