/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ExecutionMode =
  | "read"
  | "analyze"
  | "propose"
  | "commit"
  | "monitor"
  | "batch";

export type VisibilityMode =
  | "full"
  | "summary"
  | "structured_only"
  | "receipt_only"
  | "redacted"
  | "debug";

export type DeliveryMode = "sync" | "async";

export type TaskStatus =
  | "accepted"
  | "proposed"
  | "awaiting_approval"
  | "denied"
  | "running"
  | "completed"
  | "failed"
  | "revoked";

export type AuthScheme =
  | "none"
  | "bearer"
  | "mtls"
  | "signed_request"
  | "oauth2";

export type ErrorCode =
  | "agent_not_found"
  | "agent_disabled"
  | "capability_not_found"
  | "capability_disabled"
  | "policy_denied"
  | "approval_required"
  | "approval_denied"
  | "approval_expired"
  | "invalid_delegation_token"
  | "token_expired"
  | "token_invalid_signature"
  | "token_missing_scope"
  | "schema_validation_failed"
  | "schema_version_unsupported"
  | "schema_negotiation_failed"
  | "tenant_mismatch"
  | "rate_limit_exceeded"
  | "request_timeout"
  | "internal_error"
  | "invalid_request"
  | "idempotency_conflict"
  | "resource_not_found"
  | "unauthorized"
  | "forbidden"
  | "extension_support_required"
  | "invalid_state_transition"
  | "queue_capacity_exceeded";

export interface RequesterIdentity {
  type: "user" | "service" | "agent";
  id: string;
  tenant_id?: string;
}

export interface TaskConstraints {
  common?: {
    resource_id?: string;
    resource_ids?: string[];
    environment?: "development" | "staging" | "production";
    max_amount?: number;
    currency?: string;
    limit?: number;
    approval_required?: boolean;
    time_window?: {
      start: string;
      end: string;
    };
    redaction_level?: "none" | "basic" | "strict";
    [key: string]: unknown;
  };
  domain?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

export interface AgentDescriptor {
  agent_id: string;
  organization: string;
  version: string;
  domain: string;
  capabilities: string[];
  risk_level: RiskLevel;
  input_schema_ref: string;
  output_schema_ref: string;
  supported_execution_modes: ExecutionMode[];
  approval_requirements?: string[];
  visibility_modes: VisibilityMode[];
  policy_hooks?: string[];
  display_name?: string;
  provider_url?: string;
  documentation_url?: string;
  auth_schemes?: AuthScheme[];
  capability_descriptors?: CapabilityDescriptor[];
  transport_bindings?: Array<{
    kind: "http";
    endpoint: string;
  }>;
  tags?: string[];
  registry_status?: "active" | "deprecated" | "disabled";
  description?: string;
  descriptor_signature?: string;
  descriptor_key_id?: string;
  descriptor_signature_alg?: "HS256" | "RS256";
  extensions?: AgentExtension[];
}

export interface MapSignedRequestHeaders {
  "x-map-auth-scheme": "signed_request";
  "x-map-key-id": string;
  "x-map-timestamp": string;
  "x-map-request-signature": string;
  "x-map-nonce": string;
}

export interface MapErrorResponse {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  status: number;
  details?: {
    category:
      | "validation"
      | "authentication"
      | "authorization"
      | "not_found"
      | "conflict"
      | "rate_limit"
      | "server"
      | "client";
    field?: string;
    value?: unknown;
    context?: Record<string, unknown>;
  };
  request_id?: string;
}

export type ResultMode = "ok" | "error";

export interface PaginatedRequest {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    limit: number;
    next_cursor: string | null;
    total?: number;
  };
}

export interface VersionInfo {
  protocol: string;
  schema: string;
  transport: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: VersionInfo;
  uptime_ms: number;
  checks: {
    [key: string]: {
      status: "pass" | "fail" | "warn";
      message?: string;
      timestamp: string;
    };
  };
}

export interface CapabilityDescriptor {
  name: string;
  execution_mode: ExecutionMode;
  request_schema_ref: string;
  response_schema_ref: string;
  constraint_schema_ref?: string;
  approval_required_by_default?: boolean;
  auth_schemes?: AuthScheme[];
  required_auth_scheme?: Exclude<AuthScheme, "none">;
  schema_version?: string;
  supported_schema_versions?: string[];
  preferred_schema_version?: string;
  translation_targets?: Array<{
    from: string;
    to: string;
    mode: "provider_translation";
  }>;
  compatibility?:
    | "backward_compatible"
    | "forward_compatible"
    | "breaking_change";
  status?: "active" | "deprecated" | "disabled";
}

export interface DelegationToken {
  issuer: string;
  subject_agent: string;
  allowed_actions: string[];
  resource_scope: Record<string, unknown>;
  constraints: Record<string, unknown> & {
    common?: Record<string, unknown>;
    domain?: Record<string, unknown>;
    expires_at: string;
  };
  approval_reference?: string;
  requester_identity?: RequesterIdentity;
  signature: string;
}

export interface TaskEnvelope {
  task_id: string;
  order_id?: string;
  parent_task_id?: string;
  context_id?: string;
  requester_identity: RequesterIdentity;
  target_agent: string;
  intent: string;
  constraints: TaskConstraints;
  risk_class: RiskLevel;
  deadline?: string;
  delegation_token: string;
  requested_output_mode: VisibilityMode;
  /** Optional metadata bag. Known keys include:
   *  - `webhook_url`: URL to POST task result to on terminal state transition (completed, failed, denied, revoked).
   *  - `async`: Set to `true` for async delivery mode.
   *  - `request_id`, `capability`, `tenant_id`, `schema_version`, etc.
   */
  metadata?: Record<string, unknown>;
  /** Client-provided token for exactly-once effect deduplication.
   *  Differs from `idempotency_key` (which is for request dedup).
   *  `idempotency_token` is used to prevent duplicate side effects
   *  even if the same task is re-delivered. */
  idempotency_token?: string;
  extensions?: string[];
}

export interface InvocationNegotiationRequest {
  schema_version?: string;
  delivery_mode?: DeliveryMode;
}

export interface InvocationNegotiation {
  requested: {
    schema_version?: string;
    output_mode: VisibilityMode;
    delivery_mode: DeliveryMode;
  };
  selected: {
    schema_version?: string;
    output_mode: VisibilityMode;
    delivery_mode: DeliveryMode;
  };
  provider_actions?: Array<"schema_translated">;
}

export interface ResultPackage {
  task_id: string;
  context_id?: string;
  status: TaskStatus;
  summary?: string;
  structured_output: Record<string, unknown>;
  receipt_ref?: string;
  negotiated_schema_version?: string;
  requested_schema_version?: string;
  executed_schema_version?: string;
  negotiation?: InvocationNegotiation;
  redactions_applied?: string[];
  followup_required: boolean;
  escalation_reason?: string;
  extensions?: string[];
}

import type {
  ExecutionReceipt as CoreExecutionReceipt,
} from "../core/types.js";

/**
 * OrchestratorReceipt extends the core ExecutionReceipt with protocol-level
 * fields used by the orchestrator runtime. This is the unified receipt type
 * for the protocol layer — it includes all core fields plus optional
 * orchestrator-specific metadata.
 */
export interface OrchestratorReceipt extends CoreExecutionReceipt {
  task_id?: string;
  order_id?: string;
  tenant_id?: string;
  request_id?: string;
  agent_id: string;
  /** Canonical action name (same as core `action` field). */
  resource_touched?: string;
  policy_checks?: string[];
  approval_used?: string;
  result_hash?: string;
  requested_schema_version?: string;
  executed_schema_version?: string;
  negotiation?: InvocationNegotiation;
  extensions?: string[];
}

/**
 * @deprecated Use OrchestratorReceipt instead. This alias exists for backward
 * compatibility with code that imports ExecutionReceipt from the protocol layer.
 */
export type ExecutionReceipt = OrchestratorReceipt;

export interface PolicyDecision {
  allowed: boolean;
  action: "allow" | "deny" | "require_approval";
  policy_checks: string[];
  reason?: string;
  approval_reference?: string;
  scoped_constraints?: Record<string, unknown>;
}

export interface InvokeResult {
  result: ResultPackage;
  receipt: ExecutionReceipt;
}

export interface TaskRecord {
  task_id: string;
  order_id?: string;
  context_id?: string;
  requester_identity: RequesterIdentity;
  idempotency_key?: string;
  capability: string;
  target_agent: string;
  status: TaskStatus;
  result?: ResultPackage;
  receipt?: ExecutionReceipt;
  updated_at: string;
}

export interface DispatchRequest {
  capability: string;
  envelope: TaskEnvelope;
  requested_schema_version?: string;
  negotiation?: InvocationNegotiationRequest;
}

export interface ApprovalRequest {
  task_id: string;
  approval_reference: string;
  capability: string;
  envelope: TaskEnvelope;
  requested_schema_version?: string;
  negotiation?: InvocationNegotiationRequest;
}

export interface MapResponse<T, M extends ResultMode = "ok"> {
  ok: M;
  request_id?: string;
  data?: T;
  error?: M extends "ok" ? never : MapErrorResponse;
}

export interface DispatchResponse {
  result: ResultPackage;
  receipt?: ExecutionReceipt;
}

export interface ApprovalResponse {
  result: ResultPackage;
  receipt?: ExecutionReceipt;
}

export interface TaskQueryParams {
  tenant_id?: string;
  status?: TaskStatus;
  capability?: string;
  target_agent?: string;
  limit?: number;
  cursor?: string;
  /** Maximum messages to include in task history. 0 = none, unset = server default, >0 = limit */
  history_length?: number;
}

export interface AgentsQueryParams {
  domain?: string;
  capability?: string;
  organization?: string;
  limit?: number;
  cursor?: string;
}

export interface ErrorContext {
  field?: string;
  value?: unknown;
  schema_path?: string;
  original_error?: string;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: ErrorCode;
  context?: ErrorContext;
}

export interface SchemaValidationError extends MapErrorResponse {
  code: "schema_validation_failed";
  details: {
    category: "validation";
    validation_errors: ValidationErrorDetail[];
    schema_ref: string;
  };
}

export interface MapVerificationKey {
  kid: string;
  alg: "HS256" | "RS256";
  use: "sig";
  status: "active" | "retiring" | "revoked";
  scopes: string[];
  demo_only: boolean;
  kty?: "oct" | "RSA";
  public_key_pem?: string;
  jwk?: Record<string, unknown>;
}

export interface TrustAnchor {
  trust_domain: string; // e.g., "payments.bank.com"
  issuer: string; // e.g., "Bank Corp CA"
  public_keys: MapVerificationKey[]; // Trusted keys for this domain
  valid_from: string; // ISO timestamp
  valid_until?: string; // Optional expiry
}

export interface TrustPolicy {
  allowed_domains: string[]; // Whitelist of trust domains
  allowed_algorithms: ("HS256" | "RS256" | "ES256")[];
  require_signed_descriptors: boolean;
  require_signed_receipts: boolean;
  min_key_length?: number;
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  retryable: boolean,
  details?: MapErrorResponse["details"],
): MapErrorResponse {
  return { code, message, retryable, status, details };
}

export interface AnomalyReport {
  type:
    | "high_failure_rate"
    | "revoked_key_usage"
    | "retiring_key_usage"
    | "unknown_key_usage";
  severity: "warning" | "critical";
  detail: string;
  detected_at: string;
  recommendation: string;
}

export function isErrorResponse(response: {
  ok: unknown;
  error?: unknown;
}): response is { ok: "error"; error: MapErrorResponse } {
  return response.ok === "error" && response.error !== undefined;
}

export interface VersionNegotiation {
  clientVersion: string;
  serverVersion: string;
  selectedVersion: string;
  compatible: boolean;
  negotiationStrategy: "strict" | "forward" | "backward" | "fallback";
  supportedVersions: string[];
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  return 0;
}

export function isVersionCompatible(
  clientVersion: string,
  serverVersion: string,
  compatibilityMode:
    | "backward_compatible"
    | "forward_compatible"
    | "breaking_change" = "backward_compatible",
): boolean {
  const comparison = compareVersions(clientVersion, serverVersion);
  const [clientMajor] = clientVersion.split(".").map(Number);
  const [serverMajor] = serverVersion.split(".").map(Number);

  switch (compatibilityMode) {
    case "backward_compatible":
      return clientMajor === serverMajor && comparison >= 0;
    case "forward_compatible":
      return clientMajor === serverMajor && comparison <= 0;
    case "breaking_change":
      return clientVersion === serverVersion;
    default:
      return false;
  }
}

export function selectVersion(
  clientVersions: string[],
  serverVersions: string[],
  compatibilityMode:
    | "backward_compatible"
    | "forward_compatible" = "backward_compatible",
): string | null {
  const sortedClient = [...clientVersions].sort((a, b) =>
    compareVersions(b, a),
  );
  const sortedServer = [...serverVersions].sort((a, b) =>
    compareVersions(b, a),
  );

  for (const clientVer of sortedClient) {
    for (const serverVer of sortedServer) {
      if (isVersionCompatible(clientVer, serverVer, compatibilityMode)) {
        return serverVer;
      }
    }
  }
  return null;
}
