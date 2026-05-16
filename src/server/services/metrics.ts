/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PersistedMetricsState } from "../state.js";

// ---------------------------------------------------------------------------
// MetricsService — tracks request success/failure, errors, and capability
// latency in a rolling window.  Designed to be created once per handler
// invocation (singleton per server instance).
// ---------------------------------------------------------------------------

export interface RequestMetrics {
  total: number;
  succeeded: number;
  failed: number;
  window_ms: number;
  window_total: number;
  window_succeeded: number;
  window_failed: number;
  failure_rate_window: number;
}

export interface CapabilityLatencyMetrics {
  count: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
}

export class MetricsService {
  private requestsTotal: number;
  private requestsSucceeded: number;
  private requestsFailed: number;
  private requestEvents: Array<{ timestamp: number; ok: boolean }>;
  private errorsByCode: Map<string, number>;
  private errorsByAgent: Map<string, number>;
  private errorsByAgentByCode: Map<string, Map<string, number>>;
  private capabilityLatencySamples: Map<string, number[]>;

  private readonly metricsWindowMs: number;
  private readonly maxLatencySamplesPerCapability: number;
  private readonly metricsStorePath: string | undefined;

  constructor(opts: {
    metricsWindowMs: number;
    maxLatencySamplesPerCapability: number;
    metricsStorePath?: string;
  }) {
    this.metricsWindowMs = opts.metricsWindowMs;
    this.maxLatencySamplesPerCapability = opts.maxLatencySamplesPerCapability;
    this.metricsStorePath = opts.metricsStorePath;

    this.requestsTotal = 0;
    this.requestsSucceeded = 0;
    this.requestsFailed = 0;
    this.requestEvents = [];
    this.errorsByCode = new Map();
    this.errorsByAgent = new Map();
    this.errorsByAgentByCode = new Map();
    this.capabilityLatencySamples = new Map();
  }

  // Recording

  recordRequest(ok: boolean, errorCode?: string, targetAgent?: string): void {
    const now = Date.now();
    this.requestsTotal += 1;
    if (ok) {
      this.requestsSucceeded += 1;
    } else {
      this.requestsFailed += 1;
      if (errorCode) {
        this.errorsByCode.set(
          errorCode,
          (this.errorsByCode.get(errorCode) ?? 0) + 1,
        );
        if (typeof targetAgent === "string" && targetAgent.trim().length > 0) {
          const normalizedAgent = targetAgent.trim();
          this.errorsByAgent.set(
            normalizedAgent,
            (this.errorsByAgent.get(normalizedAgent) ?? 0) + 1,
          );
          const agentCodes =
            this.errorsByAgentByCode.get(normalizedAgent) ??
            new Map<string, number>();
          agentCodes.set(errorCode, (agentCodes.get(errorCode) ?? 0) + 1);
          this.errorsByAgentByCode.set(normalizedAgent, agentCodes);
        }
      }
    }
    this.requestEvents.push({ timestamp: now, ok });
    this.pruneRequestEvents(now);
  }

  recordCapabilityLatency(capability: string, durationMs: number): void {
    const key = capability.trim();
    if (!key) return;
    const existing = this.capabilityLatencySamples.get(key) ?? [];
    existing.push(Math.max(0, durationMs));
    if (existing.length > this.maxLatencySamplesPerCapability) {
      existing.splice(0, existing.length - this.maxLatencySamplesPerCapability);
    }
    this.capabilityLatencySamples.set(key, existing);
  }

  // Query

  getRequestMetrics(): RequestMetrics {
    const now = Date.now();
    this.pruneRequestEvents(now);
    const windowTotal = this.requestEvents.length;
    const windowFailed = this.requestEvents.reduce(
      (acc, event) => acc + (event.ok ? 0 : 1),
      0,
    );
    const windowSuccess = windowTotal - windowFailed;
    const failureRateWindow = windowTotal > 0 ? windowFailed / windowTotal : 0;
    return {
      total: this.requestsTotal,
      succeeded: this.requestsSucceeded,
      failed: this.requestsFailed,
      window_ms: this.metricsWindowMs,
      window_total: windowTotal,
      window_succeeded: windowSuccess,
      window_failed: windowFailed,
      failure_rate_window: failureRateWindow,
    };
  }

  getErrorBreakdown(): {
    by_code: Record<string, number>;
    by_agent: Record<string, number>;
    by_agent_by_code: Record<string, Record<string, number>>;
  } {
    return {
      by_code: Object.fromEntries(this.errorsByCode.entries()),
      by_agent: Object.fromEntries(this.errorsByAgent.entries()),
      by_agent_by_code: Object.fromEntries(
        Array.from(this.errorsByAgentByCode.entries()).map(
          ([agent, codeMap]) => [agent, Object.fromEntries(codeMap.entries())],
        ),
      ),
    };
  }

  getCapabilityLatencyMetrics(): Record<string, CapabilityLatencyMetrics> {
    const result: Record<string, CapabilityLatencyMetrics> = {};
    for (const [
      capability,
      samples,
    ] of this.capabilityLatencySamples.entries()) {
      if (samples.length === 0) continue;
      const sorted = [...samples].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, value) => acc + value, 0);
      result[capability] = {
        count: sorted.length,
        avg_ms: sum / sorted.length,
        p50_ms: MetricsService.percentile(sorted, 0.5),
        p95_ms: MetricsService.percentile(sorted, 0.95),
      };
    }
    return result;
  }

  getFailureRate(): number {
    return this.getRequestMetrics().failure_rate_window;
  }

  // Persistence

  toJSON(): PersistedMetricsState {
    const now = Date.now();
    this.pruneRequestEvents(now);
    return {
      requests_total: this.requestsTotal,
      requests_succeeded: this.requestsSucceeded,
      requests_failed: this.requestsFailed,
      request_events: [...this.requestEvents],
      errors_by_code: Object.fromEntries(this.errorsByCode.entries()),
      errors_by_agent: Object.fromEntries(this.errorsByAgent.entries()),
      errors_by_agent_by_code: Object.fromEntries(
        Array.from(this.errorsByAgentByCode.entries()).map(
          ([agent, codeMap]) => [agent, Object.fromEntries(codeMap.entries())],
        ),
      ),
      capability_latency_samples: Object.fromEntries(
        this.capabilityLatencySamples.entries(),
      ),
    };
  }

  fromJSON(data: PersistedMetricsState): void {
    this.requestsTotal = data.requests_total;
    this.requestsSucceeded = data.requests_succeeded;
    this.requestsFailed = data.requests_failed;
    this.requestEvents = data.request_events ?? [];
    this.errorsByCode = new Map(Object.entries(data.errors_by_code ?? {}));
    this.errorsByAgent = new Map(Object.entries(data.errors_by_agent ?? {}));
    this.errorsByAgentByCode = new Map(
      Object.entries(data.errors_by_agent_by_code ?? {}).map(
        ([agent, codes]) => [
          agent,
          new Map<string, number>(Object.entries(codes)),
        ],
      ),
    );
    this.capabilityLatencySamples = new Map(
      Object.entries(data.capability_latency_samples ?? {}).map(
        ([capability, samples]) => [
          capability,
          Array.isArray(samples) ? samples : [],
        ],
      ),
    );
    this.pruneRequestEvents(Date.now());
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private pruneRequestEvents(now: number): void {
    while (
      this.requestEvents.length > 0 &&
      now - this.requestEvents[0].timestamp > this.metricsWindowMs
    ) {
      this.requestEvents.shift();
    }
  }

  private static percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(p * sorted.length) - 1),
    );
    return sorted[index];
  }
}

/** Factory function that creates a MetricsService and hydrates it from disk. */
export function createMetricsService(opts: {
  metricsWindowMs: number;
  maxLatencySamplesPerCapability: number;
  metricsStorePath?: string;
  hydratedState?: PersistedMetricsState;
}): MetricsService {
  const service = new MetricsService(opts);
  if (opts.hydratedState) {
    service.fromJSON(opts.hydratedState);
  }
  return service;
}

/**
 * Export a MetricsService snapshot to a portable JSON payload for backup.
 * This captures all internal counters, event windows, error maps, and
 * capability latency samples so they can be restored later via importMetrics.
 */
export function exportMetrics(service: MetricsService): PersistedMetricsState {
  return service.toJSON();
}

/**
 * Import a previously-exported MetricsService snapshot (e.g. from a backup).
 * The service is mutated in-place; all prior state is replaced.
 */
export function importMetrics(
  service: MetricsService,
  state: PersistedMetricsState,
): void {
  service.fromJSON(state);
}
