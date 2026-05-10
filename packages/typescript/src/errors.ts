/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

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
  | "forbidden";

export const ERROR_CODE_STATUS_MAP: Record<ErrorCode, number> = {
  agent_not_found: 404,
  agent_disabled: 403,
  capability_not_found: 404,
  capability_disabled: 403,
  policy_denied: 403,
  approval_required: 202,
  approval_denied: 403,
  approval_expired: 410,
  invalid_delegation_token: 401,
  token_expired: 401,
  token_invalid_signature: 401,
  token_missing_scope: 403,
  schema_validation_failed: 400,
  schema_version_unsupported: 400,
  schema_negotiation_failed: 400,
  tenant_mismatch: 400,
  rate_limit_exceeded: 429,
  request_timeout: 408,
  internal_error: 500,
  invalid_request: 400,
  idempotency_conflict: 409,
  resource_not_found: 404,
  unauthorized: 401,
  forbidden: 403,
};

export const ERROR_CODE_RETRYABLE_MAP: Record<ErrorCode, boolean> = {
  agent_not_found: false,
  agent_disabled: false,
  capability_not_found: false,
  capability_disabled: false,
  policy_denied: false,
  approval_required: false,
  approval_denied: false,
  approval_expired: false,
  invalid_delegation_token: false,
  token_expired: false,
  token_invalid_signature: false,
  token_missing_scope: false,
  schema_validation_failed: false,
  schema_version_unsupported: false,
  schema_negotiation_failed: false,
  tenant_mismatch: false,
  rate_limit_exceeded: true,
  request_timeout: true,
  internal_error: true,
  invalid_request: false,
  idempotency_conflict: false,
  resource_not_found: false,
  unauthorized: true,
  forbidden: false,
};

export interface ErrorDetails {
  category?: "validation" | "authentication" | "authorization" | "not_found" | "conflict" | "rate_limit" | "server" | "client";
  field?: string;
  value?: unknown;
  context?: Record<string, unknown>;
  validation_errors?: ValidationErrorDetail[];
  schema_ref?: string;
}

export interface ErrorContext {
  field_path?: string;
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

export interface APIErrorResponse {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
  details?: ErrorDetails;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  if (typeof value !== "string") return false;
  return value in ERROR_CODE_STATUS_MAP;
}

export class MapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapError';
  }
}

export class MapAPIError extends MapError {
  constructor(options: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    status?: number;
    details?: ErrorDetails;
  }) {
    super(options.message);
    this.name = 'MapAPIError';
    this.code = options.code;
    this.status = options.status ?? ERROR_CODE_STATUS_MAP[options.code];
    this.retryable = options.retryable ?? ERROR_CODE_RETRYABLE_MAP[options.code];
    this.details = options.details;
  }

  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly details?: ErrorDetails;
}

export class MapValidationError extends MapError {
  constructor(public readonly errors: ValidationErrorDetail[]) {
    super(`Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
    this.name = 'MapValidationError';
  }
}

export class MapSigningError extends MapError {
  constructor(message: string) {
    super(message);
    this.name = 'MapSigningError';
  }
}

export class MapTimeoutError extends MapError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'MapTimeoutError';
  }
}

export class MapRetryableError extends MapError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'MapRetryableError';
  }
}
