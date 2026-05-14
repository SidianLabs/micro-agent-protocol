import { createServer as createHttpsServer } from "node:https";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createReferenceApp } from "./app.js";
import type { MicroAgent } from "./runtime/micro-agent.js";
import { handleAdminRoutes } from "./server/admin-routes.js";
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
} from "./security/signing.js";
import {
  validateApprovalRequest,
  validateDispatchRequest,
} from "./validation/schema-validator.js";
import {
  getRequiredAuthScheme,
  getSignedRequestError,
  getBearerTokenError,
} from "./server/auth.js";
import {
  readJsonBody as parseJsonBody,
  sendError as sendErrorResponse,
  sendJson as sendJsonResponse,
} from "./server/http.js";
import { handleMutationRoutes } from "./server/mutation-routes.js";
import { handleReadRoutes } from "./server/read-routes.js";
import {
  checkWritableFilePath,
  clampRatio,
  extractTargetAgent,
  extractTenantId,
  isConfigured,
  normalizePath,
  parsePositiveIntOrDefault,
  wantsSignedRequestAuth,
  type JsonBodyReadResult,
} from "./server/utils.js";

export interface MapHttpServerOptions {
  deploymentProfile?: "open" | "verified" | "regulated";
  port?: number;
  enforceSignedRequests?: boolean;
  enforceBearerAuth?: boolean;
  taskStorePath?: string;
  taskStoreDbPath?: string;
  receiptStorePath?: string;
  receiptStoreDbPath?: string;
  requireTenant?: boolean;
  asyncQueueMaxAttempts?: number;
  asyncQueueRetryDelayMs?: number;
  asyncQueueMaxRetryDelayMs?: number;
  asyncQueueRetryJitterRatio?: number;
  asyncQueueMaxConcurrent?: number;
  asyncQueueMaxConcurrentPerTenant?: number;
  asyncQueueMaxQueueDepth?: number;
  deadLetterStorePath?: string;
  asyncQueueMaxDeadLetters?: number;
  healthMaxDeadLetters?: number;
  healthMaxOldestDeadLetterAgeMs?: number;
  metricsWindowMs?: number;
  metricsMaxLatencySamplesPerCapability?: number;
  metricsFailureRateThreshold?: number;
  metricsStorePath?: string;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  rateLimitMaxRequestsPerTenant?: number;
  rateLimitStatePath?: string;
  auditStorePath?: string;
  auditMaxEvents?: number;
  auditCheckpointInterval?: number;
  signingRetiringKeyCriticalRatio?: number;
  signingUnknownKeyCriticalRatio?: number;
  alertStorePath?: string;
  runtimeControlStorePath?: string;
  agents?: MicroAgent[];
  certPath?: string;
  keyPath?: string;
  mtls?: { requestCert: boolean; rejectUnauthorized: boolean; caPath?: string };
}

interface PersistedMetricsState {
  requests_total: number;
  requests_succeeded: number;
  requests_failed: number;
  request_events: Array<{ timestamp: number; ok: boolean }>;
  errors_by_code: Record<string, number>;
  errors_by_agent: Record<string, number>;
  errors_by_agent_by_code: Record<string, Record<string, number>>;
  capability_latency_samples: Record<string, number[]>;
}

interface AuditEvent {
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
  event_hash: string;
}

interface AuditCheckpoint {
  checkpoint_id: string;
  created_at: string;
  last_chain_index: number;
  last_event_hash: string;
  key_id: string;
  signature: string;
}

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

interface RuntimeControlState {
  disabled_agents: Record<
    string,
    { disabled_at: string; disabled_by: string; reason?: string }
  >;
  disabled_capabilities: Record<
    string,
    Record<
      string,
      { disabled_at: string; disabled_by: string; reason?: string }
    >
  >;
  revoked_keys: Record<
    string,
    { revoked_at: string; revoked_by: string; reason?: string }
  >;
}

interface DeploymentProfileEvaluation {
  profile: "open" | "verified" | "regulated";
  compliant: boolean;
  violations: string[];
}

interface PersistedRateLimitState {
  global: number[];
  tenants: Record<string, number[]>;
}

export function createMapHandler(options: MapHttpServerOptions = {}) {
  const deploymentProfile = options.deploymentProfile ?? "open";
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
    agents: options.agents,
  });

  const metricsWindowMs = Math.max(1, options.metricsWindowMs ?? 5 * 60 * 1000);
  const rateLimitWindowMs = Math.max(1, options.rateLimitWindowMs ?? 60_000);
  const maxLatencySamplesPerCapability = Math.max(
    10,
    options.metricsMaxLatencySamplesPerCapability ?? 200,
  );
  const metricsStorePath = options.metricsStorePath;
  const auditStorePath = options.auditStorePath;
  const alertStorePath = options.alertStorePath;
  const runtimeControlStorePath = options.runtimeControlStorePath;
  const taskStorePersistencePath =
    options.taskStoreDbPath ?? options.taskStorePath;
  const receiptStorePersistencePath =
    options.receiptStoreDbPath ?? options.receiptStorePath;
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
  const globalRateLimitEvents: number[] = [];
  const tenantRateLimitEvents = new Map<string, number[]>();
  const rateLimitStatePath = options.rateLimitStatePath;
  const auditEvents: AuditEvent[] = [];
  const auditCheckpoints: AuditCheckpoint[] = [];
  const alertState = new Map<string, AlertRecord>();
  const revokedSigningKeys = new Map<
    string,
    { revoked_at: string; revoked_by: string; reason?: string }
  >();
  const disabledAgents = new Map<
    string,
    { disabled_at: string; disabled_by: string; reason?: string }
  >();
  const disabledCapabilities = new Map<
    string,
    Map<string, { disabled_at: string; disabled_by: string; reason?: string }>
  >();

  function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  function hydrateRuntimeControls(): void {
    if (!runtimeControlStorePath || !existsSync(runtimeControlStorePath)) {
      return;
    }
    try {
      const raw = readFileSync(runtimeControlStorePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RuntimeControlState>;
      for (const [agentId, value] of Object.entries(
        parsed.disabled_agents ?? {},
      )) {
        if (!agentId || !value) continue;
        disabledAgents.set(agentId, {
          disabled_at: value.disabled_at,
          disabled_by: value.disabled_by,
          reason: value.reason,
        });
      }
      for (const [agentId, capabilityMap] of Object.entries(
        parsed.disabled_capabilities ?? {},
      )) {
        if (!agentId || !capabilityMap || typeof capabilityMap !== "object")
          continue;
        const nested = new Map<
          string,
          { disabled_at: string; disabled_by: string; reason?: string }
        >();
        for (const [capability, value] of Object.entries(capabilityMap)) {
          if (!capability || !value) continue;
          nested.set(capability, {
            disabled_at: value.disabled_at,
            disabled_by: value.disabled_by,
            reason: value.reason,
          });
        }
        if (nested.size > 0) disabledCapabilities.set(agentId, nested);
      }
      for (const [kid, value] of Object.entries(parsed.revoked_keys ?? {})) {
        if (!kid || !value) continue;
        revokedSigningKeys.set(kid, {
          revoked_at: value.revoked_at,
          revoked_by: value.revoked_by,
          reason: value.reason,
        });
      }
    } catch {
      // Ignore malformed runtime-control store in reference mode.
    }
  }

  function persistRuntimeControls(): void {
    if (!runtimeControlStorePath) return;
    const disabledCapabilitiesObj = Object.fromEntries(
      Array.from(disabledCapabilities.entries()).map(
        ([agentId, capabilities]) => [
          agentId,
          Object.fromEntries(capabilities.entries()),
        ],
      ),
    );
    const payload: RuntimeControlState = {
      disabled_agents: Object.fromEntries(disabledAgents.entries()),
      disabled_capabilities: disabledCapabilitiesObj,
      revoked_keys: Object.fromEntries(revokedSigningKeys.entries()),
    };
    mkdirSync(dirname(runtimeControlStorePath), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(runtimeControlStorePath, JSON.stringify(payload, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  function hydrateRateLimitState(): void {
    if (!rateLimitStatePath || !existsSync(rateLimitStatePath)) return;
    try {
      const raw = readFileSync(rateLimitStatePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedRateLimitState>;
      const now = Date.now();
      if (Array.isArray(parsed.global)) {
        for (const ts of parsed.global) {
          if (typeof ts === "number" && now - ts <= rateLimitWindowMs) {
            globalRateLimitEvents.push(ts);
          }
        }
      }
      if (parsed.tenants && typeof parsed.tenants === "object") {
        for (const [tenantId, events] of Object.entries(parsed.tenants)) {
          if (Array.isArray(events)) {
            const pruned: number[] = [];
            for (const ts of events) {
              if (typeof ts === "number" && now - ts <= rateLimitWindowMs) {
                pruned.push(ts);
              }
            }
            if (pruned.length > 0) tenantRateLimitEvents.set(tenantId, pruned);
          }
        }
      }
    } catch {
      // Ignore malformed rate limit state file.
    }
  }

  function persistRateLimitState(): void {
    if (!rateLimitStatePath) return;
    const now = Date.now();
    while (
      globalRateLimitEvents.length > 0 &&
      now - globalRateLimitEvents[0] > rateLimitWindowMs
    ) {
      globalRateLimitEvents.shift();
    }
    const tenants: Record<string, number[]> = {};
    for (const [tenantId, events] of tenantRateLimitEvents.entries()) {
      while (events.length > 0 && now - events[0] > rateLimitWindowMs) {
        events.shift();
      }
      if (events.length > 0) tenants[tenantId] = events;
    }
    const serialized: PersistedRateLimitState = {
      global: globalRateLimitEvents,
      tenants,
    };
    mkdirSync(dirname(rateLimitStatePath), { recursive: true, mode: 0o700 });
    writeFileSync(rateLimitStatePath, JSON.stringify(serialized, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
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

  function evaluateDeploymentProfile(): DeploymentProfileEvaluation {
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

  function snapshotRuntimeControls(): RuntimeControlState {
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

  function hydrateAlertState(): void {
    if (!alertStorePath || !existsSync(alertStorePath)) return;
    try {
      const raw = readFileSync(alertStorePath, "utf8");
      const parsed = JSON.parse(raw) as { alerts?: AlertRecord[] };
      const alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
      for (const alert of alerts) {
        if (typeof alert.id === "string" && alert.id.length > 0) {
          alertState.set(alert.id, alert);
        }
      }
    } catch {
      // Ignore malformed alert store in reference mode.
    }
  }

  function persistAlertState(): void {
    if (!alertStorePath) return;
    mkdirSync(dirname(alertStorePath), { recursive: true, mode: 0o700 });
    writeFileSync(
      alertStorePath,
      JSON.stringify({ alerts: [...alertState.values()] }, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
  }

  function hydrateAuditEvents(): void {
    if (!auditStorePath || !existsSync(auditStorePath)) return;
    try {
      const raw = readFileSync(auditStorePath, "utf8");
      const parsed = JSON.parse(raw) as {
        events?: AuditEvent[];
        checkpoints?: AuditCheckpoint[];
      };
      const events = Array.isArray(parsed.events) ? parsed.events : [];
      auditEvents.push(
        ...events.slice(Math.max(0, events.length - auditMaxEvents)),
      );
      const checkpoints = Array.isArray(parsed.checkpoints)
        ? parsed.checkpoints
        : [];
      auditCheckpoints.push(...checkpoints);
    } catch {
      // Ignore malformed audit store in reference mode.
    }
  }

  function persistAuditEvents(): void {
    if (!auditStorePath) return;
    mkdirSync(dirname(auditStorePath), { recursive: true, mode: 0o700 });
    writeFileSync(
      auditStorePath,
      JSON.stringify(
        { events: auditEvents, checkpoints: auditCheckpoints },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
  }

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

  function createAuditCheckpoint(lastEvent: AuditEvent): void {
    if (lastEvent.chain_index % auditCheckpointInterval !== 0) return;
    const checkpoint: AuditCheckpoint = {
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

  function collectSigningKeyUsage(): {
    agent_descriptors_by_key_id: Record<string, number>;
    receipts_by_key_id: Record<string, number>;
    audit_checkpoints_by_key_id: Record<string, number>;
  } {
    const descriptors = app.registry.list();
    return collectSigningKeyUsageForData({
      descriptors,
      receipts: app.receiptStore.list(),
      checkpoints: auditCheckpoints,
    });
  }

  function collectSigningKeyUsageForData(input: {
    descriptors: ReturnType<(typeof app.registry)["list"]>;
    receipts: ReturnType<(typeof app.receiptStore)["list"]>;
    checkpoints: typeof auditCheckpoints;
  }): {
    agent_descriptors_by_key_id: Record<string, number>;
    receipts_by_key_id: Record<string, number>;
    audit_checkpoints_by_key_id: Record<string, number>;
  } {
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
  } {
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

  function computeAlertCandidates(
    tenantId?: string,
  ): Array<Omit<AlertRecord, "first_seen" | "last_seen">> {
    const queueStats = app.asyncQueue.getStats();
    const requestMetrics = getRequestMetrics();
    const deadLetterCount = tenantId
      ? app.asyncQueue.listDeadLettersByTenant(tenantId).length
      : queueStats.dead_letter_count;
    const signalAlerts = getAlerts(requestMetrics, queueStats, deadLetterCount);
    const tenantReceipts = tenantId
      ? app.receiptStore.list(tenantId)
      : app.receiptStore.list();
    const signingUsage = collectSigningKeyUsageForData({
      descriptors: app.registry.list(),
      receipts: tenantReceipts,
      checkpoints: auditCheckpoints,
    });
    const signingAnomalies = collectSigningAnomalies(signingUsage);
    const scopeSuffix = tenantId ? `:${tenantId}` : ":global";
    const candidates: Array<Omit<AlertRecord, "first_seen" | "last_seen">> = [];

    if (signalAlerts.breaches.dead_letter_count_exceeded) {
      candidates.push({
        id: `alert:queue:dead_letter_count_exceeded${scopeSuffix}`,
        source: "queue",
        code: "dead_letter_count_exceeded",
        severity: "warning",
        message: "Dead-letter count exceeded configured threshold.",
        recommended_action:
          "Inspect dead letters and remediate recurring execution failures.",
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
    }

    if (signalAlerts.breaches.oldest_dead_letter_age_exceeded) {
      candidates.push({
        id: `alert:queue:oldest_dead_letter_age_exceeded${scopeSuffix}`,
        source: "queue",
        code: "oldest_dead_letter_age_exceeded",
        severity: "warning",
        message: "Oldest dead-letter age exceeded configured threshold.",
        recommended_action:
          "Investigate stalled failures and clear or replay dead-letter tasks.",
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
    }

    if (signalAlerts.breaches.request_failure_rate_exceeded) {
      candidates.push({
        id: `alert:requests:failure_rate_exceeded${scopeSuffix}`,
        source: "requests",
        code: "request_failure_rate_exceeded",
        severity: "warning",
        message: "Request failure rate exceeded configured threshold.",
        recommended_action:
          "Check recent errors and mitigate root causes before traffic impact grows.",
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
    }

    if (signingAnomalies.unknown_key_usage_detected) {
      candidates.push({
        id: `alert:signing:unknown_key_usage${scopeSuffix}`,
        source: "signing",
        code: "unknown_key_usage_detected",
        severity: signingAnomalies.threshold_breaches.unknown_key_ratio_exceeded
          ? "critical"
          : "warning",
        message: "Unknown signing key usage was detected.",
        recommended_action: signingAnomalies.recommended_action,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
    }

    if (signingAnomalies.retiring_key_usage_detected) {
      candidates.push({
        id: `alert:signing:retiring_key_usage${scopeSuffix}`,
        source: "signing",
        code: "retiring_key_usage_detected",
        severity: signingAnomalies.threshold_breaches
          .retiring_key_ratio_exceeded
          ? "critical"
          : "warning",
        message: "Retiring signing key usage was detected.",
        recommended_action: signingAnomalies.recommended_action,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
    }

    return candidates;
  }

  function getActiveAlerts(tenantId?: string): AlertRecord[] {
    const nowIso = new Date().toISOString();
    const candidates = computeAlertCandidates(tenantId);
    const activeIds = new Set(candidates.map((candidate) => candidate.id));

    for (const candidate of candidates) {
      const existing = alertState.get(candidate.id);
      if (!existing) {
        alertState.set(candidate.id, {
          ...candidate,
          first_seen: nowIso,
          last_seen: nowIso,
        });
      } else {
        alertState.set(candidate.id, {
          ...existing,
          ...candidate,
          first_seen: existing.first_seen,
          last_seen: nowIso,
        });
      }
    }

    for (const [id, existing] of alertState.entries()) {
      const isSameScope =
        (tenantId && existing.tenant_id === tenantId) ||
        (!tenantId && typeof existing.tenant_id !== "string");
      if (isSameScope && !activeIds.has(id)) {
        alertState.set(id, { ...existing, last_seen: nowIso });
      }
    }

    persistAlertState();

    return [...alertState.values()]
      .filter((alert) => {
        if (!activeIds.has(alert.id)) return false;
        if (!alert.suppressed_until) return true;
        const suppressedUntilMs = Date.parse(alert.suppressed_until);
        return (
          Number.isNaN(suppressedUntilMs) || suppressedUntilMs <= Date.now()
        );
      })
      .sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
      );
  }

  function recordAuditEvent(
    event: Omit<AuditEvent, "chain_index" | "prev_event_hash" | "event_hash">,
  ): void {
    const last = auditEvents[auditEvents.length - 1];
    const chainIndex = last ? last.chain_index + 1 : 1;
    const prevEventHash = last ? last.event_hash : "GENESIS";
    const eventHash = hashAuditEventBase({
      ...event,
      chain_index: chainIndex,
      prev_event_hash: prevEventHash,
    });
    const chainedEvent: AuditEvent = {
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
    persistAuditEvents();
  }

  hydrateAuditEvents();
  hydrateAlertState();
  hydrateRuntimeControls();
  hydrateRateLimitState();

  function hydrateMetricsState(): PersistedMetricsState {
    if (!metricsStorePath || !existsSync(metricsStorePath)) {
      return {
        requests_total: 0,
        requests_succeeded: 0,
        requests_failed: 0,
        request_events: [],
        errors_by_code: {},
        errors_by_agent: {},
        errors_by_agent_by_code: {},
        capability_latency_samples: {},
      };
    }
    try {
      const raw = readFileSync(metricsStorePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedMetricsState>;
      return {
        requests_total:
          typeof parsed.requests_total === "number" ? parsed.requests_total : 0,
        requests_succeeded:
          typeof parsed.requests_succeeded === "number"
            ? parsed.requests_succeeded
            : 0,
        requests_failed:
          typeof parsed.requests_failed === "number"
            ? parsed.requests_failed
            : 0,
        request_events: Array.isArray(parsed.request_events)
          ? parsed.request_events
          : [],
        errors_by_code:
          parsed.errors_by_code && typeof parsed.errors_by_code === "object"
            ? parsed.errors_by_code
            : {},
        errors_by_agent:
          parsed.errors_by_agent && typeof parsed.errors_by_agent === "object"
            ? parsed.errors_by_agent
            : {},
        errors_by_agent_by_code:
          parsed.errors_by_agent_by_code &&
          typeof parsed.errors_by_agent_by_code === "object"
            ? parsed.errors_by_agent_by_code
            : {},
        capability_latency_samples:
          parsed.capability_latency_samples &&
          typeof parsed.capability_latency_samples === "object"
            ? parsed.capability_latency_samples
            : {},
      };
    } catch {
      return {
        requests_total: 0,
        requests_succeeded: 0,
        requests_failed: 0,
        request_events: [],
        errors_by_code: {},
        errors_by_agent: {},
        errors_by_agent_by_code: {},
        capability_latency_samples: {},
      };
    }
  }

  const hydratedMetrics = hydrateMetricsState();
  const requestEvents: Array<{ timestamp: number; ok: boolean }> =
    hydratedMetrics.request_events;
  let requestsTotal = hydratedMetrics.requests_total;
  let requestsSucceeded = hydratedMetrics.requests_succeeded;
  let requestsFailed = hydratedMetrics.requests_failed;
  const errorsByCode = new Map<string, number>(
    Object.entries(hydratedMetrics.errors_by_code),
  );
  const errorsByAgent = new Map<string, number>(
    Object.entries(hydratedMetrics.errors_by_agent),
  );
  const errorsByAgentByCode = new Map<string, Map<string, number>>(
    Object.entries(hydratedMetrics.errors_by_agent_by_code).map(
      ([agent, codes]) => [
        agent,
        new Map<string, number>(Object.entries(codes)),
      ],
    ),
  );
  const capabilityLatencySamples = new Map<string, number[]>(
    Object.entries(hydratedMetrics.capability_latency_samples).map(
      ([capability, samples]) => [
        capability,
        Array.isArray(samples) ? samples : [],
      ],
    ),
  );

  function persistMetricsState(): void {
    if (!metricsStorePath) return;
    const serialized: PersistedMetricsState = {
      requests_total: requestsTotal,
      requests_succeeded: requestsSucceeded,
      requests_failed: requestsFailed,
      request_events: requestEvents,
      errors_by_code: Object.fromEntries(errorsByCode.entries()),
      errors_by_agent: Object.fromEntries(errorsByAgent.entries()),
      errors_by_agent_by_code: Object.fromEntries(
        Array.from(errorsByAgentByCode.entries()).map(([agent, codeMap]) => [
          agent,
          Object.fromEntries(codeMap.entries()),
        ]),
      ),
      capability_latency_samples: Object.fromEntries(
        capabilityLatencySamples.entries(),
      ),
    };
    mkdirSync(dirname(metricsStorePath), { recursive: true, mode: 0o700 });
    writeFileSync(metricsStorePath, JSON.stringify(serialized, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  function pruneRequestEvents(now: number): void {
    while (
      requestEvents.length > 0 &&
      now - requestEvents[0].timestamp > metricsWindowMs
    ) {
      requestEvents.shift();
    }
    persistMetricsState();
  }

  function recordRequest(
    ok: boolean,
    errorCode?: string,
    targetAgent?: string,
  ): void {
    const now = Date.now();
    requestsTotal += 1;
    if (ok) {
      requestsSucceeded += 1;
    } else {
      requestsFailed += 1;
      if (errorCode) {
        errorsByCode.set(errorCode, (errorsByCode.get(errorCode) ?? 0) + 1);
        if (typeof targetAgent === "string" && targetAgent.trim().length > 0) {
          const normalizedAgent = targetAgent.trim();
          errorsByAgent.set(
            normalizedAgent,
            (errorsByAgent.get(normalizedAgent) ?? 0) + 1,
          );
          const agentCodes =
            errorsByAgentByCode.get(normalizedAgent) ??
            new Map<string, number>();
          agentCodes.set(errorCode, (agentCodes.get(errorCode) ?? 0) + 1);
          errorsByAgentByCode.set(normalizedAgent, agentCodes);
        }
      }
    }
    requestEvents.push({ timestamp: now, ok });
    pruneRequestEvents(now);
    persistMetricsState();
  }

  function getRequestMetrics() {
    const now = Date.now();
    pruneRequestEvents(now);
    const windowTotal = requestEvents.length;
    const windowFailed = requestEvents.reduce(
      (acc, event) => acc + (event.ok ? 0 : 1),
      0,
    );
    const windowSuccess = windowTotal - windowFailed;
    const failureRateWindow = windowTotal > 0 ? windowFailed / windowTotal : 0;
    return {
      total: requestsTotal,
      succeeded: requestsSucceeded,
      failed: requestsFailed,
      window_ms: metricsWindowMs,
      window_total: windowTotal,
      window_succeeded: windowSuccess,
      window_failed: windowFailed,
      failure_rate_window: failureRateWindow,
    };
  }

  function recordCapabilityLatency(
    capability: string,
    durationMs: number,
  ): void {
    const key = capability.trim();
    if (!key) return;
    const existing = capabilityLatencySamples.get(key) ?? [];
    existing.push(Math.max(0, durationMs));
    if (existing.length > maxLatencySamplesPerCapability) {
      existing.splice(0, existing.length - maxLatencySamplesPerCapability);
    }
    capabilityLatencySamples.set(key, existing);
    persistMetricsState();
  }

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(p * sorted.length) - 1),
    );
    return sorted[index];
  }

  function getCapabilityLatencyMetrics(): Record<
    string,
    { count: number; avg_ms: number; p50_ms: number; p95_ms: number }
  > {
    const result: Record<
      string,
      { count: number; avg_ms: number; p50_ms: number; p95_ms: number }
    > = {};
    for (const [capability, samples] of capabilityLatencySamples.entries()) {
      if (samples.length === 0) continue;
      const sorted = [...samples].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, value) => acc + value, 0);
      result[capability] = {
        count: sorted.length,
        avg_ms: sum / sorted.length,
        p50_ms: percentile(sorted, 0.5),
        p95_ms: percentile(sorted, 0.95),
      };
    }
    return result;
  }

  function getAlerts(
    requestMetrics: ReturnType<typeof getRequestMetrics>,
    queueStats: ReturnType<(typeof app.asyncQueue)["getStats"]>,
    deadLetterCount: number,
  ): {
    thresholds: {
      dead_letter_count?: number;
      oldest_dead_letter_age_ms?: number;
      request_failure_rate_window?: number;
    };
    breaches: {
      dead_letter_count_exceeded: boolean;
      oldest_dead_letter_age_exceeded: boolean;
      request_failure_rate_exceeded: boolean;
    };
  } {
    const deadLetterCountThreshold = options.healthMaxDeadLetters;
    const oldestDeadLetterAgeThreshold = options.healthMaxOldestDeadLetterAgeMs;
    const failureRateThreshold = options.metricsFailureRateThreshold;
    const thresholds: {
      dead_letter_count?: number;
      oldest_dead_letter_age_ms?: number;
      request_failure_rate_window?: number;
    } = {};
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
      recordRequest,
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
      recordRequest,
      targetAgent,
    );
  }

  function consumeRateLimitSlot(
    events: number[],
    limit: number | undefined,
  ): {
    allowed: boolean;
    retryAfterMs: number;
  } {
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
      if (mutated) persistRateLimitState();
      return { allowed: false, retryAfterMs };
    }

    events.push(now);
    persistRateLimitState();
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

  async function readJsonBody(
    req: IncomingMessage,
  ): Promise<JsonBodyReadResult> {
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
      // Artificial delay to slow brute-force attacks (50-100ms)
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

  // Periodic outbox processor: delivers pending side effects (webhooks, notifications)
  // every 5 seconds. The outbox pattern ensures task state changes and side effects
  // are atomically persisted together.
  const outboxInterval = setInterval(() => {
    app.asyncQueue.processOutbox();
  }, 5_000);
  // Allow the Node.js process to exit even if this interval is still running.
  outboxInterval.unref();

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

      // MCP-like resource discovery: GET /agents/{agent_id}/resources
      if (
        req.method === "GET" &&
        req.url &&
        req.url.match(/^\/agents\/[^/]+\/resources(\?.*)?$/)
      ) {
        const pathParts = new URL(req.url, "http://localhost").pathname.split(
          "/",
        );
        const agentId = decodeURIComponent(pathParts[2]);
        const agent = app.registry.get(agentId);
        if (!agent) {
          sendError(res, 404, requestId, {
            code: "agent_not_found",
            message: `Agent not found: ${agentId}`,
            retryable: false,
          });
          return;
        }
        sendJson(
          res,
          200,
          {
            agent_id: agent.agent_id,
            resources: [
              {
                name: "input_schema",
                uri: agent.input_schema_ref,
                mime_type: "application/schema+json",
              },
              {
                name: "output_schema",
                uri: agent.output_schema_ref,
                mime_type: "application/schema+json",
              },
            ],
          },
          requestId,
        );
        return;
      }

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
          ...getRequestMetrics(),
          errors: {
            by_code: Object.fromEntries(errorsByCode.entries()),
            by_agent: Object.fromEntries(errorsByAgent.entries()),
            by_agent_by_code: Object.fromEntries(
              Array.from(errorsByAgentByCode.entries()).map(
                ([agent, codeMap]) => [
                  agent,
                  Object.fromEntries(codeMap.entries()),
                ],
              ),
            ),
          },
        }),
        getAlerts,
        getCapabilityLatencyMetrics,
        getActiveAlerts,
        persistAlertState,
        sendJson,
        sendError,
        readJsonBody,
        snapshotRuntimeControls,
        getAdminTokenError,
        getRuntimeRevocationMetadata,
      });
      if (readRouteHandled) return;

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
        persistRuntimeControls,
        recordAuditEvent,
      });
      if (adminRouteHandled) return;

      // Handle task cancellation
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
        recordCapabilityLatency,
        sendJson,
        sendError,
      });
      routeTargetAgent = mutationRouteResult.routeTargetAgent;
      routeTenantId = mutationRouteResult.routeTenantId;
      if (mutationRouteResult.handled) return;

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
    }
  };
}

export function createMapServer(options: MapHttpServerOptions = {}): Server {
  const handler = createMapHandler(options);
  if (options.certPath && options.keyPath) {
    const cert = readFileSync(options.certPath);
    const key = readFileSync(options.keyPath);
    // For mTLS, set requestCert: true and rejectUnauthorized: true in the https options
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
