import type { AgentDescriptor } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Server configuration options
// ─────────────────────────────────────────────────────────────────────────────

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
  agents?: AgentDescriptor[];
  /** Path to a JSON policy file. Loaded at startup; updated on POST /policy. */
  policyFilePath?: string;
  /** Default webhook URL for approval notifications. Can be overridden per-request via envelope metadata. */
  approvalWebhookUrl?: string;
  /** Base URL of this MAP server instance (used in approval notification payloads). */
  serverBaseUrl?: string;
  certPath?: string;
  keyPath?: string;
  mtls?: {
    requestCert: boolean;
    rejectUnauthorized: boolean;
    caPath?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime state interfaces (re-exported for consumers like demo server)
// ─────────────────────────────────────────────────────────────────────────────

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

export interface PersistedRateLimitState {
  global: number[];
  tenants: Record<string, number[]>;
}

export interface RuntimeControlState {
  disabled_agents: Record<string, unknown>;
  disabled_capabilities: Record<string, Record<string, unknown>>;
  revoked_keys: Record<string, unknown>;
}

export interface DeploymentProfileEvaluation {
  profile: "open" | "verified" | "regulated";
  compliant: boolean;
  violations: string[];
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
  subject?: string;
}

export interface AuditCheckpoint {
  checkpoint_id: string;
  created_at: string;
  last_chain_index: number;
  last_event_hash: string;
  key_id: string;
  signature: string;
}
