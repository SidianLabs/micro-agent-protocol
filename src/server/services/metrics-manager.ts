/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MetricsService, createMetricsService } from "./metrics.js";
import { SLOMonitor } from "./slo-monitor.js";
import { persistMetricsState as persistMetricsStateToDisk } from "../state.js";
import type { PersistedMetricsState } from "../state.js";

export interface MetricsManagerOptions {
  metricsWindowMs: number;
  maxLatencySamplesPerCapability: number;
  metricsStorePath?: string;
  hydratedState?: PersistedMetricsState;
}

export class MetricsManager {
  public readonly metrics: MetricsService;
  public readonly sloMonitor: SLOMonitor;
  private readonly metricsWindowMs: number;
  private readonly metricsStorePath?: string;

  constructor(opts: MetricsManagerOptions) {
    this.metricsWindowMs = opts.metricsWindowMs;
    this.metricsStorePath = opts.metricsStorePath;
    this.metrics = createMetricsService(opts);
    this.sloMonitor = new SLOMonitor();
  }

  recordRequest(ok: boolean, errorCode?: string, targetAgent?: string): void {
    this.metrics.recordRequest(ok, errorCode, targetAgent);
    this.sloMonitor.recordMetric("dispatch.success_rate", ok ? 0 : 1);
  }

  recordCapabilityLatency(capability: string, durationMs: number): void {
    this.metrics.recordCapabilityLatency(capability, durationMs);
    this.sloMonitor.recordMetric("dispatch.latency_p95_ms", durationMs);
  }

  getRequestMetrics() {
    return {
      ...this.metrics.getRequestMetrics(),
      errors: this.metrics.getErrorBreakdown(),
    };
  }

  getCapabilityLatencyMetrics() {
    return this.metrics.getCapabilityLatencyMetrics();
  }

  persist(): void {
    if (!this.metricsStorePath) return;

    // 1. Persist general metrics
    const json = this.metrics.toJSON();
    persistMetricsStateToDisk(this.metricsStorePath, {
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
      metricsWindowMs: this.metricsWindowMs,
    });

    // 2. Persist SLO metrics
    try {
      const sloJson = this.sloMonitor.toJSON();
      const sloPath = this.metricsStorePath.replace(/\.json$/, "-slo.json");
      mkdirSync(dirname(sloPath), { recursive: true });
      writeFileSync(sloPath, JSON.stringify(sloJson, null, 2), "utf8");
    } catch {
      // Non-critical – SLO persistence failure should not crash the server.
    }
  }
}
