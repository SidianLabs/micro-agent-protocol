/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AlertRecord } from "../state.js";
import type { RequestMetrics } from "./metrics.js";

// ---------------------------------------------------------------------------
// AlertService — computes and tracks alert lifecycle.  It depends on
// external callbacks to fetch current system state (queue stats, metrics,
// signing usage, etc.) so that it can be kept free of direct store references.
// ---------------------------------------------------------------------------

export interface AlertThresholds {
  dead_letter_count?: number;
  oldest_dead_letter_age_ms?: number;
  request_failure_rate_window?: number;
}

export interface AlertBreaches {
  dead_letter_count_exceeded: boolean;
  oldest_dead_letter_age_exceeded: boolean;
  request_failure_rate_exceeded: boolean;
}

export interface AlertCandidate {
  id: string;
  source: "queue" | "requests" | "signing" | "slo";
  code: string;
  severity: "warning" | "critical";
  message: string;
  recommended_action: string;
  tenant_id?: string;
  slo_name?: string;
  budget_remaining_percent?: number;
}

export interface SigningKeyUsage {
  agent_descriptors_by_key_id: Record<string, number>;
  receipts_by_key_id: Record<string, number>;
  audit_checkpoints_by_key_id: Record<string, number>;
}

export interface SigningAnomalies {
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
}

/** Dependencies the AlertService needs to compute candidates */
export interface AlertServiceDependencies {
  getQueueStats: () => {
    dead_letter_count: number;
    oldest_dead_letter_age_ms?: number;
    max_queue_depth: number;
    queue_depth: number;
    max_concurrent: number;
    active_count: number;
    [key: string]: unknown;
  };
  getRequestMetrics: () => RequestMetrics;
  listDeadLettersByTenant: (tenantId: string) => unknown[];
  listReceiptsByTenant: (tenantId?: string) => unknown[];
  listRegistryDescriptors: () => unknown[];
  getAuditCheckpoints: () => unknown[];
  collectSigningAnomalies: (usage: SigningKeyUsage) => SigningAnomalies;
  collectSigningKeyUsageForData: (input: {
    descriptors: unknown[];
    receipts: unknown[];
    checkpoints: unknown[];
  }) => SigningKeyUsage;
  healthMaxDeadLetters?: number;
  healthMaxOldestDeadLetterAgeMs?: number;
  metricsFailureRateThreshold?: number;
  /** Optional callback that returns SLO-based alert candidates. */
  getSLOAlerts?: () => AlertCandidate[];
}

export class AlertService {
  private alertState: Map<string, AlertRecord>;

  /** Dependencies used to compute alert candidates. */
  private readonly deps: AlertServiceDependencies;

  constructor(
    deps: AlertServiceDependencies,
    alertState?: Map<string, AlertRecord>,
  ) {
    this.deps = deps;
    this.alertState = alertState ?? new Map();
  }

  // -----------------------------------------------------------------------
  // Threshold evaluation (mirrors `getAlerts` in the original server.ts)
  // -----------------------------------------------------------------------

  private evaluateThresholds(
    requestMetrics: RequestMetrics,
    queueStats: ReturnType<AlertServiceDependencies["getQueueStats"]>,
    deadLetterCount: number,
  ): { thresholds: AlertThresholds; breaches: AlertBreaches } {
    const thresholds: AlertThresholds = {};
    if (typeof this.deps.healthMaxDeadLetters === "number") {
      thresholds.dead_letter_count = this.deps.healthMaxDeadLetters;
    }
    if (typeof this.deps.healthMaxOldestDeadLetterAgeMs === "number") {
      thresholds.oldest_dead_letter_age_ms =
        this.deps.healthMaxOldestDeadLetterAgeMs;
    }
    if (typeof this.deps.metricsFailureRateThreshold === "number") {
      thresholds.request_failure_rate_window =
        this.deps.metricsFailureRateThreshold;
    }

    return {
      thresholds,
      breaches: {
        dead_letter_count_exceeded:
          typeof this.deps.healthMaxDeadLetters === "number" &&
          deadLetterCount > this.deps.healthMaxDeadLetters,
        oldest_dead_letter_age_exceeded:
          typeof this.deps.healthMaxOldestDeadLetterAgeMs === "number" &&
          typeof queueStats.oldest_dead_letter_age_ms === "number" &&
          queueStats.oldest_dead_letter_age_ms >
            this.deps.healthMaxOldestDeadLetterAgeMs,
        request_failure_rate_exceeded:
          typeof this.deps.metricsFailureRateThreshold === "number" &&
          requestMetrics.failure_rate_window >
            this.deps.metricsFailureRateThreshold,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Candidate computation
  // -----------------------------------------------------------------------

  computeAlertCandidates(tenantId?: string): AlertCandidate[] {
    const queueStats = this.deps.getQueueStats();
    const requestMetrics = this.deps.getRequestMetrics();
    const deadLetterCount = tenantId
      ? this.deps.listDeadLettersByTenant(tenantId).length
      : queueStats.dead_letter_count;
    const signalAlerts = this.evaluateThresholds(
      requestMetrics,
      queueStats,
      deadLetterCount,
    );
    const tenantReceipts = tenantId
      ? this.deps.listReceiptsByTenant(tenantId)
      : this.deps.listReceiptsByTenant();
    const signingUsage = this.deps.collectSigningKeyUsageForData({
      descriptors: this.deps.listRegistryDescriptors(),
      receipts: tenantReceipts,
      checkpoints: this.deps.getAuditCheckpoints(),
    });
    const signingAnomalies = this.deps.collectSigningAnomalies(signingUsage);
    const scopeSuffix = tenantId ? `:${tenantId}` : ":global";
    const candidates: AlertCandidate[] = [];

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

    // ── SLO-based alerts ───────────────────────────────────────────────
    if (this.deps.getSLOAlerts) {
      const sloAlerts = this.deps.getSLOAlerts();
      for (const sloAlert of sloAlerts) {
        candidates.push({
          ...sloAlert,
          id: `${sloAlert.id}${scopeSuffix}`,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        });
      }
    }

    return candidates;
  }

  // -----------------------------------------------------------------------
  // Active alert lifecycle
  // -----------------------------------------------------------------------

  getActiveAlerts(tenantId?: string): AlertRecord[] {
    const nowIso = new Date().toISOString();
    const candidates = this.computeAlertCandidates(tenantId);
    const activeIds = new Set(candidates.map((c) => c.id));

    for (const candidate of candidates) {
      const existing = this.alertState.get(candidate.id);
      if (!existing) {
        this.alertState.set(candidate.id, {
          ...candidate,
          first_seen: nowIso,
          last_seen: nowIso,
        });
      } else {
        this.alertState.set(candidate.id, {
          ...existing,
          ...candidate,
          first_seen: existing.first_seen,
          last_seen: nowIso,
        });
      }
    }

    for (const [id, existing] of this.alertState.entries()) {
      const isSameScope =
        (tenantId && existing.tenant_id === tenantId) ||
        (!tenantId && typeof existing.tenant_id !== "string");
      if (isSameScope && !activeIds.has(id)) {
        this.alertState.set(id, { ...existing, last_seen: nowIso });
      }
    }

    return [...this.alertState.values()]
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

  // -----------------------------------------------------------------------
  // Manual alert management
  // -----------------------------------------------------------------------

  acknowledgeAlert(id: string, actor: string): AlertRecord | undefined {
    const existing = this.alertState.get(id);
    if (!existing) return undefined;
    const updated: AlertRecord = {
      ...existing,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: actor,
    };
    this.alertState.set(id, updated);
    return updated;
  }

  suppressAlert(
    id: string,
    durationMs: number,
    actor?: string,
  ): AlertRecord | undefined {
    const existing = this.alertState.get(id);
    if (!existing) return undefined;
    const suppressedUntil = new Date(
      Date.now() + Math.max(0, durationMs),
    ).toISOString();
    const updated: AlertRecord = {
      ...existing,
      suppressed_until: suppressedUntil,
      ...(actor ? { suppressed_by: actor } : {}),
    };
    this.alertState.set(id, updated);
    return updated;
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  toJSON(): { alerts: AlertRecord[] } {
    return { alerts: [...this.alertState.values()] };
  }

  fromJSON(data: { alerts?: AlertRecord[] }): void {
    this.alertState.clear();
    const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
    for (const alert of alerts) {
      if (typeof alert.id === "string" && alert.id.length > 0) {
        this.alertState.set(alert.id, alert);
      }
    }
  }

  /** Expose the raw alert map for snapshotting */
  getAlertState(): Map<string, AlertRecord> {
    return this.alertState;
  }
}
