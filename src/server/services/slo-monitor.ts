/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// SLOMonitor — tracks Service Level Objectives and error budgets.
//
// Error budget = (1 - target) * total_requests - failures
//   budget > 50%  → ok
//   budget 0–50%  → warning
//   budget < 0%   → critical
// ---------------------------------------------------------------------------

export interface SLO {
  /** The SLO name (e.g. "dispatch.success_rate") */
  name: string;
  /** Target value (e.g. 0.999 for 99.9% success rate) */
  target: number;
  /** Rolling window label (e.g. "30d", "7d", "24h") */
  window: string;
  /** Critical threshold – when the metric crosses this, the SLO is in breach */
  critical: number;
}

export interface ErrorBudget {
  name: string;
  /** Remaining error budget (can be negative) */
  remaining: number;
  /** Total error budget */
  total: number;
  /** Percentage remaining (0-100) */
  percent: number;
  /** Current status */
  status: "ok" | "warning" | "critical";
}

export interface SLOAlert {
  id: string;
  source: "slo";
  code: string;
  severity: "warning" | "critical";
  message: string;
  recommended_action: string;
  slo_name: string;
  budget_remaining_percent: number;
}

/**
 * Internal tracking structure for a single SLO metric.
 */
interface SLOTracker {
  slo: SLO;
  totalRequests: number;
  failures: number;
  /** For latency SLOs we track samples instead of pass/fail */
  latencySamples: number[];
}

export class SLOMonitor {
  private readonly slos: Map<string, SLOTracker> = new Map();

  // Default SLOs
  constructor() {
    this.slos.set("dispatch.success_rate", {
      slo: { name: "dispatch.success_rate", target: 0.999, window: "30d", critical: 0.99 },
      totalRequests: 0,
      failures: 0,
      latencySamples: [],
    });
    this.slos.set("dispatch.latency_p95_ms", {
      slo: { name: "dispatch.latency_p95_ms", target: 500, window: "30d", critical: 1000 },
      totalRequests: 0,
      failures: 0,
      latencySamples: [],
    });
    this.slos.set("async_queue.dead_letter_rate", {
      slo: { name: "async_queue.dead_letter_rate", target: 0.01, window: "30d", critical: 0.05 },
      totalRequests: 0,
      failures: 0,
      latencySamples: [],
    });
  }

  // Recording

  /**
   * Record a metric value against a named SLO.
   *
   * For rate-based SLOs (success_rate, dead_letter_rate):
   *   - value is treated as a pass/fail where value > target means "bad"
   *   - e.g. recordMetric("dispatch.success_rate", 0) for success, 1 for failure
   *
   * For latency-based SLOs:
   *   - value is the observed latency in ms
   *   - we store samples and compute p95 on query
   */
  recordMetric(name: string, value: number): void {
    const tracker = this.slos.get(name);
    if (!tracker) return;

    // Latency SLOs collect samples
    if (name.includes("latency")) {
      tracker.latencySamples.push(value);
      // Keep at most 10000 samples
      if (tracker.latencySamples.length > 10000) {
        tracker.latencySamples.splice(0, tracker.latencySamples.length - 10000);
      }
      return;
    }

    // Rate-based SLOs: value is "bad" count (0 = good, 1 = bad)
    tracker.totalRequests += 1;
    if (value > 0) {
      tracker.failures += value;
    }
  }

  // Query

  /**
   * Compute the error budget for a named SLO.
   */
  getErrorBudget(name: string): ErrorBudget | undefined {
    const tracker = this.slos.get(name);
    if (!tracker) return undefined;

    if (name.includes("latency")) {
      return this.computeLatencyBudget(tracker);
    }

    return this.computeRateBudget(tracker);
  }

  /**
   * Return all error budgets.
   */
  getAllBudgets(): Map<string, ErrorBudget> {
    const result = new Map<string, ErrorBudget>();
    for (const [name] of this.slos) {
      const budget = this.getErrorBudget(name);
      if (budget) {
        result.set(name, budget);
      }
    }
    return result;
  }

  /**
   * Check for SLO-based alerts.
   */
  checkAlerts(): SLOAlert[] {
    const alerts: SLOAlert[] = [];
    for (const [name] of this.slos) {
      const budget = this.getErrorBudget(name);
      if (!budget || budget.status === "ok") continue;

      const tracker = this.slos.get(name)!;
      alerts.push({
        id: `alert:slo:${name.replace(/\./g, "_")}`,
        source: "slo",
        code: `slo_budget_${budget.status}`,
        severity: budget.status,
        message: `SLO "${name}" error budget is at ${budget.percent.toFixed(1)}% (${budget.status}).`,
        recommended_action:
          budget.status === "critical"
            ? `Investigate immediately: ${name} SLO is in breach. Review recent failures and latency issues.`
            : `Monitor closely: ${name} error budget is running low. Consider slowing feature velocity.`,
        slo_name: name,
        budget_remaining_percent: budget.percent,
      });
    }
    return alerts;
  }

  // -----------------------------------------------------------------------
  // Persistence helpers
  // -----------------------------------------------------------------------

  toJSON(): Record<string, { totalRequests: number; failures: number; latencySamples: number[] }> {
    const result: Record<string, { totalRequests: number; failures: number; latencySamples: number[] }> = {};
    for (const [name, tracker] of this.slos) {
      result[name] = {
        totalRequests: tracker.totalRequests,
        failures: tracker.failures,
        latencySamples: tracker.latencySamples,
      };
    }
    return result;
  }

  fromJSON(data: Record<string, { totalRequests: number; failures: number; latencySamples: number[] }>): void {
    for (const [name, snapshot] of Object.entries(data)) {
      const tracker = this.slos.get(name);
      if (tracker) {
        tracker.totalRequests = snapshot.totalRequests ?? 0;
        tracker.failures = snapshot.failures ?? 0;
        tracker.latencySamples = Array.isArray(snapshot.latencySamples) ? snapshot.latencySamples : [];
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private computeRateBudget(tracker: SLOTracker): ErrorBudget {
    const { slo, totalRequests, failures } = tracker;
    const totalBudget = (1 - slo.target) * Math.max(totalRequests, 1);
    const remaining = totalBudget - failures;
    const percent = totalBudget > 0 ? (remaining / totalBudget) * 100 : 100;

    let status: "ok" | "warning" | "critical" = "ok";
    if (remaining < 0) {
      status = "critical";
    } else if (percent < 50) {
      status = "warning";
    }

    return {
      name: slo.name,
      remaining,
      total: totalBudget,
      percent,
      status,
    };
  }

  private computeLatencyBudget(tracker: SLOTracker): ErrorBudget {
    const { slo, latencySamples } = tracker;
    if (latencySamples.length === 0) {
      return {
        name: slo.name,
        remaining: 1,
        total: 1,
        percent: 100,
        status: "ok",
      };
    }

    const sorted = [...latencySamples].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
    const p95 = sorted[p95Index]!;

    // Budget is based on how far p95 is from the target
    // total budget = target value (e.g., 500ms)
    // remaining = target - p95 (positive means good)
    const totalBudget = slo.target;
    const remaining = slo.target - p95;
    const percent = Math.max(0, (remaining / totalBudget) * 100);

    let status: "ok" | "warning" | "critical" = "ok";
    if (p95 > slo.critical) {
      status = "critical";
    } else if (percent < 50) {
      status = "warning";
    }

    return {
      name: slo.name,
      remaining,
      total: totalBudget,
      percent,
      status,
    };
  }
}
