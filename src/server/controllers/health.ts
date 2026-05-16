/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { checkWritableFilePath } from "../persistence.js";
import type {
  DeploymentProfileEvaluation,
} from "../types.js";

export interface HealthContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  deploymentProfile: "open" | "verified" | "regulated";
  options: {
    healthMaxDeadLetters?: number;
    healthMaxOldestDeadLetterAgeMs?: number;
    asyncQueueMaxAttempts?: number;
    asyncQueueRetryDelayMs?: number;
    asyncQueueMaxRetryDelayMs?: number;
    asyncQueueRetryJitterRatio?: number;
    asyncQueueMaxConcurrent?: number;
    asyncQueueMaxConcurrentPerTenant?: number;
    asyncQueueMaxQueueDepth?: number;
    asyncQueueMaxDeadLetters?: number;
    deadLetterStorePath?: string;
    metricsStorePath?: string;
    metricsFailureRateThreshold?: number;
    auditStorePath?: string;
    rateLimitMaxRequests?: number;
    rateLimitMaxRequestsPerTenant?: number;
    enforceSignedRequests?: boolean;
    requireTenant?: boolean;
  };
  app: {
    asyncQueue: {
      getStats(): any;
    };
  };
  taskStorePersistencePath?: string;
  receiptStorePersistencePath?: string;
  metricsWindowMs: number;
  rateLimitWindowMs: number;
  maxLatencySamplesPerCapability: number;
  auditMaxEvents: number;
  auditCheckpointInterval: number;
  signingRetiringKeyCriticalRatio: number;
  signingUnknownKeyCriticalRatio: number;
  evaluateDeploymentProfile(): DeploymentProfileEvaluation;
  collectSigningKeyUsage(): {
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
  getEffectiveVerificationKeys(): any[];
  getSigningProviderStatus(): any;
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
}

export async function handleHealth(ctx: HealthContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/health") {
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
    ctx.sendJson(res, 200, {
      status: degraded ? "degraded" : "ok",
      protocol: "MAP",
      version: "0.1.0",
      checks: {
        queue: queueStats,
        deployment_profile: profileEvaluation,
        ...(degraded ? { degraded_reasons: reasons } : {}),
      },
    }, requestId);
    return true;
  }

  if (req.method === "GET" && url === "/ready") {
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

    ctx.sendJson(res, allWritable ? 200 : 503, {
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
    }, requestId);
    return true;
  }

  if (req.method === "GET" && url === "/status") {
    const signingKeyUsage = ctx.collectSigningKeyUsage();
    const signingAnomalies = ctx.collectSigningAnomalies(signingKeyUsage);
    ctx.sendJson(res, 200, {
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
          key_provider: ctx.getSigningProviderStatus(),
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
    }, requestId);
    return true;
  }

  return false;
}
