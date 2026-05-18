/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type PolicyAction = "allow" | "deny" | "require_approval";
export type ExecutionStatus = "ok" | "error";
export type ReceiptAction = "executed" | "denied" | "approval_required";

export interface RequesterIdentity {
  type: "user" | "service";
  id: string;
  tenant_id?: string;
}

export interface IntentConstraints {
  environment?: "development" | "staging" | "production";
  timeout_ms?: number;
  max_amount?: number;
  resource_id?: string;
}

export interface IntentMetadata {
  intent_id: string;
  request_id?: string;
  webhook_url?: string;
}

export interface Intent {
  capability: string;
  input: Record<string, unknown>;
  requester: RequesterIdentity;
  constraints?: IntentConstraints;
  metadata?: IntentMetadata;
  risk_class?: RiskLevel;
}

export interface PolicyDecision {
  action: PolicyAction;
  reason?: string;
  matched_rule?: string;
}

export interface ExecutionContext {
  intent_id: string;
  requester: RequesterIdentity;
}

export interface ExecutionResult {
  intent_id: string;
  capability: string;
  status: ExecutionStatus;
  output: Record<string, unknown>;
  summary: string;
}

export interface ExecutionReceipt {
  receipt_id: string;
  intent_id: string;
  capability: string;
  action: ReceiptAction;
  timestamp: string;
  status: ExecutionStatus;
  signature?: string;
}

export interface ECPErrorResponse {
  ok: "error";
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ECPResponse<T> {
  ok: "ok";
  data: T;
}

export type PolicyCondition =
  | ComparisonCondition
  | LogicalAndCondition
  | LogicalOrCondition
  | LogicalNotCondition
  | AlwaysCondition
  | NeverCondition
  | FieldRef;

export interface AlwaysCondition {
  always: true;
}

export interface NeverCondition {
  never: true;
}

export interface ComparisonCondition {
  [operator: string]: [string, unknown];
}

export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";

export interface LogicalAndCondition {
  and: PolicyCondition[];
}

export interface LogicalOrCondition {
  or: PolicyCondition[];
}

export interface LogicalNotCondition {
  not: PolicyCondition;
}

export interface FieldRef {
  $field: string;
}

export interface PolicyRule {
  id: string;
  capability: string;
  condition: PolicyCondition;
  action: PolicyAction;
}

export interface PolicyDocument {
  version: "1.0";
  rules: PolicyRule[];
  /** Default action when no rule matches. Defaults to "deny" (fail-closed). */
  default_action?: PolicyAction;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export interface ExecutionAdapter {
  readonly capability: string;
  validate(input: unknown): ValidationResult;
  execute(
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ExecutionResult>;
}

export type Capability = string;

export interface ApprovalRequest {
  intent_id: string;
  capability: string;
  requester: RequesterIdentity;
  reason?: string;
}

export interface ApprovalResult {
  approved: boolean;
  approval_reference?: string;
  decision?: PolicyDecision;
}