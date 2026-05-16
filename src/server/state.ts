/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from "node:fs";
import { readJSON, writeJSON } from "./persistence.js";

// Interfaces

export interface PersistedMetricsState {
  requests_total: number;
  requests_succeeded: number;
  requests_failed: number;
  request_events: Array<{ timestamp: number; ok: boolean }>;
  errors_by_code: Record<string, number>;
  errors_by_agent: Record<string, number>;
  errors_by_agent_by_code: Record<string, Record<string, number>>;
  capability_latency_samples: Record<string, number[]>;
}

export interface AuditEvent {
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

export interface AuditCheckpoint {
  checkpoint_id: string;
  created_at: string;
  last_chain_index: number;
  last_event_hash: string;
  key_id: string;
  signature: string;
}

export interface AlertRecord {
  id: string;
  source: "queue" | "requests" | "signing" | "slo";
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
  slo_name?: string;
  budget_remaining_percent?: number;
}

export interface RuntimeControlState {
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

export interface DeploymentProfileEvaluation {
  profile: "open" | "verified" | "regulated";
  compliant: boolean;
  violations: string[];
}

export interface PersistedRateLimitState {
  global: number[];
  tenants: Record<string, number[]>;
}

// Options passed to the hydrate / persist helpers

export interface StatePersistenceOptions {
  runtimeControlStorePath?: string;
  rateLimitStatePath?: string;
  rateLimitWindowMs: number;
  alertStorePath?: string;
  auditStorePath?: string;
  auditMaxEvents: number;
  metricsStorePath?: string;
  metricsWindowMs: number;
}

// The aggregate in-memory state shape

export interface AllRuntimeState {
  // runtime controls
  disabledAgents: Map<
    string,
    { disabled_at: string; disabled_by: string; reason?: string }
  >;
  disabledCapabilities: Map<
    string,
    Map<string, { disabled_at: string; disabled_by: string; reason?: string }>
  >;
  revokedSigningKeys: Map<
    string,
    { revoked_at: string; revoked_by: string; reason?: string }
  >;
  // rate limit
  globalRateLimitEvents: number[];
  tenantRateLimitEvents: Map<string, number[]>;
  // alerts
  alertState: Map<string, AlertRecord>;
  // audit
  auditEvents: AuditEvent[];
  auditCheckpoints: AuditCheckpoint[];
  // metrics raw persisted snapshot
  metricsState: PersistedMetricsState;
}

// Individual hydrate helpers

export function hydrateRuntimeControls(
  path: string | undefined,
  disabledAgents: Map<
    string,
    { disabled_at: string; disabled_by: string; reason?: string }
  >,
  disabledCapabilities: Map<
    string,
    Map<string, { disabled_at: string; disabled_by: string; reason?: string }>
  >,
  revokedSigningKeys: Map<
    string,
    { revoked_at: string; revoked_by: string; reason?: string }
  >,
): void {
  if (!path || !existsSync(path)) return;
  try {
    const parsed = readJSON<Partial<RuntimeControlState>>(path);
    if (!parsed) return;

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

export function hydrateRateLimitState(
  path: string | undefined,
  rateLimitWindowMs: number,
  globalRateLimitEvents: number[],
  tenantRateLimitEvents: Map<string, number[]>,
): void {
  if (!path || !existsSync(path)) return;
  try {
    const parsed = readJSON<Partial<PersistedRateLimitState>>(path);
    if (!parsed) return;
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

export function hydrateAlertState(
  path: string | undefined,
  alertState: Map<string, AlertRecord>,
): void {
  if (!path || !existsSync(path)) return;
  try {
    const parsed = readJSON<{ alerts?: AlertRecord[] }>(path);
    if (!parsed) return;
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

export function hydrateAuditEvents(
  path: string | undefined,
  auditMaxEvents: number,
  auditEvents: AuditEvent[],
  auditCheckpoints: AuditCheckpoint[],
): void {
  if (!path || !existsSync(path)) return;
  try {
    const parsed = readJSON<{
      events?: AuditEvent[];
      checkpoints?: AuditCheckpoint[];
    }>(path);
    if (!parsed) return;
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

export function hydrateMetricsState(
  path: string | undefined,
): PersistedMetricsState {
  if (!path || !existsSync(path)) {
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
    const parsed = readJSON<Partial<PersistedMetricsState>>(path);
    if (!parsed) {
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
    return {
      requests_total:
        typeof parsed.requests_total === "number" ? parsed.requests_total : 0,
      requests_succeeded:
        typeof parsed.requests_succeeded === "number"
          ? parsed.requests_succeeded
          : 0,
      requests_failed:
        typeof parsed.requests_failed === "number" ? parsed.requests_failed : 0,
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

// Individual persist helpers

export function persistRuntimeControls(
  path: string | undefined,
  disabledAgents: Map<
    string,
    { disabled_at: string; disabled_by: string; reason?: string }
  >,
  disabledCapabilities: Map<
    string,
    Map<string, { disabled_at: string; disabled_by: string; reason?: string }>
  >,
  revokedSigningKeys: Map<
    string,
    { revoked_at: string; revoked_by: string; reason?: string }
  >,
): void {
  if (!path) return;
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
  writeJSON(path, payload);
}

export function persistRateLimitState(
  path: string | undefined,
  rateLimitWindowMs: number,
  globalRateLimitEvents: number[],
  tenantRateLimitEvents: Map<string, number[]>,
): void {
  if (!path) return;
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
  writeJSON(path, serialized);
}

export function persistAlertState(
  path: string | undefined,
  alertState: Map<string, AlertRecord>,
): void {
  if (!path) return;
  writeJSON(path, { alerts: [...alertState.values()] });
}

export function persistAuditEvents(
  path: string | undefined,
  auditEvents: AuditEvent[],
  auditCheckpoints: AuditCheckpoint[],
): void {
  if (!path) return;
  writeJSON(path, { events: auditEvents, checkpoints: auditCheckpoints });
}

export function persistMetricsState(
  path: string | undefined,
  state: {
    requestsTotal: number;
    requestsSucceeded: number;
    requestsFailed: number;
    requestEvents: Array<{ timestamp: number; ok: boolean }>;
    errorsByCode: Map<string, number>;
    errorsByAgent: Map<string, number>;
    errorsByAgentByCode: Map<string, Map<string, number>>;
    capabilityLatencySamples: Map<string, number[]>;
    metricsWindowMs: number;
  },
): void {
  if (!path) return;
  // Prune before persisting
  const now = Date.now();
  const events = state.requestEvents;
  while (
    events.length > 0 &&
    now - events[0].timestamp > state.metricsWindowMs
  ) {
    events.shift();
  }

  const serialized: PersistedMetricsState = {
    requests_total: state.requestsTotal,
    requests_succeeded: state.requestsSucceeded,
    requests_failed: state.requestsFailed,
    request_events: events,
    errors_by_code: Object.fromEntries(state.errorsByCode.entries()),
    errors_by_agent: Object.fromEntries(state.errorsByAgent.entries()),
    errors_by_agent_by_code: Object.fromEntries(
      Array.from(state.errorsByAgentByCode.entries()).map(
        ([agent, codeMap]) => [agent, Object.fromEntries(codeMap.entries())],
      ),
    ),
    capability_latency_samples: Object.fromEntries(
      state.capabilityLatencySamples.entries(),
    ),
  };
  writeJSON(path, serialized);
}

// Convenience: hydrate everything at once

export function hydrateAllState(
  opts: StatePersistenceOptions,
): AllRuntimeState {
  const disabledAgents = new Map<
    string,
    { disabled_at: string; disabled_by: string; reason?: string }
  >();
  const disabledCapabilities = new Map<
    string,
    Map<string, { disabled_at: string; disabled_by: string; reason?: string }>
  >();
  const revokedSigningKeys = new Map<
    string,
    { revoked_at: string; revoked_by: string; reason?: string }
  >();
  const globalRateLimitEvents: number[] = [];
  const tenantRateLimitEvents = new Map<string, number[]>();
  const alertState = new Map<string, AlertRecord>();
  const auditEvents: AuditEvent[] = [];
  const auditCheckpoints: AuditCheckpoint[] = [];

  hydrateRuntimeControls(
    opts.runtimeControlStorePath,
    disabledAgents,
    disabledCapabilities,
    revokedSigningKeys,
  );
  hydrateRateLimitState(
    opts.rateLimitStatePath,
    opts.rateLimitWindowMs,
    globalRateLimitEvents,
    tenantRateLimitEvents,
  );
  hydrateAlertState(opts.alertStorePath, alertState);
  hydrateAuditEvents(
    opts.auditStorePath,
    opts.auditMaxEvents,
    auditEvents,
    auditCheckpoints,
  );
  const metricsState = hydrateMetricsState(opts.metricsStorePath);

  return {
    disabledAgents,
    disabledCapabilities,
    revokedSigningKeys,
    globalRateLimitEvents,
    tenantRateLimitEvents,
    alertState,
    auditEvents,
    auditCheckpoints,
    metricsState,
  };
}

// Convenience: persist everything at once

export function persistAllState(
  state: AllRuntimeState,
  opts: StatePersistenceOptions,
): void {
  persistRuntimeControls(
    opts.runtimeControlStorePath,
    state.disabledAgents,
    state.disabledCapabilities,
    state.revokedSigningKeys,
  );
  persistRateLimitState(
    opts.rateLimitStatePath,
    opts.rateLimitWindowMs,
    state.globalRateLimitEvents,
    state.tenantRateLimitEvents,
  );
  persistAlertState(opts.alertStorePath, state.alertState);
  persistAuditEvents(
    opts.auditStorePath,
    state.auditEvents,
    state.auditCheckpoints,
  );
  // Metrics are persisted separately via MetricsService
}
