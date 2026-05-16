/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MapAPIError,
  ERROR_CODE_RETRYABLE_MAP,
  ERROR_CODE_STATUS_MAP,
} from '../dist/index.js';

describe('Error Codes', () => {
  it('should have retryable map with all error codes', () => {
    const errorCodes = [
      'agent_not_found',
      'agent_disabled',
      'capability_not_found',
      'capability_disabled',
      'policy_denied',
      'approval_required',
      'approval_denied',
      'approval_expired',
      'invalid_delegation_token',
      'token_expired',
      'token_invalid_signature',
      'token_missing_scope',
      'schema_validation_failed',
      'schema_version_unsupported',
      'schema_negotiation_failed',
      'tenant_mismatch',
      'rate_limit_exceeded',
      'request_timeout',
      'internal_error',
      'invalid_request',
      'idempotency_conflict',
      'resource_not_found',
      'unauthorized',
      'forbidden',
    ] as const;

    for (const code of errorCodes) {
      assert.ok(
        code in ERROR_CODE_RETRYABLE_MAP,
        `Error code ${code} should be in ERROR_CODE_RETRYABLE_MAP`
      );
    }
  });

  it('should have status map with all error codes', () => {
    const errorCodes = [
      'agent_not_found',
      'agent_disabled',
      'capability_not_found',
      'capability_disabled',
      'policy_denied',
      'approval_required',
      'approval_denied',
      'approval_expired',
      'invalid_delegation_token',
      'token_expired',
      'token_invalid_signature',
      'token_missing_scope',
      'schema_validation_failed',
      'schema_version_unsupported',
      'schema_negotiation_failed',
      'tenant_mismatch',
      'rate_limit_exceeded',
      'request_timeout',
      'internal_error',
      'invalid_request',
      'idempotency_conflict',
      'resource_not_found',
      'unauthorized',
      'forbidden',
    ] as const;

    for (const code of errorCodes) {
      assert.ok(
        code in ERROR_CODE_STATUS_MAP,
        `Error code ${code} should be in ERROR_CODE_STATUS_MAP`
      );
      const status = ERROR_CODE_STATUS_MAP[code];
      assert.ok(typeof status === 'number', `Status for ${code} should be a number`);
      assert.ok(status > 0, `Status for ${code} should be positive`);
    }
  });

  it('should have correct retryable flags', () => {
    // Rate limit and timeout should be retryable
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['rate_limit_exceeded'], true);
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['request_timeout'], true);
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['internal_error'], true);
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['unauthorized'], true);

    // Not found errors should not be retryable
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['agent_not_found'], false);
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['resource_not_found'], false);

    // Auth errors should not be retryable
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['invalid_request'], false);
    assert.strictEqual(ERROR_CODE_RETRYABLE_MAP['forbidden'], false);
  });

  it('should have correct status codes', () => {
    assert.strictEqual(ERROR_CODE_STATUS_MAP['agent_not_found'], 404);
    assert.strictEqual(ERROR_CODE_STATUS_MAP['rate_limit_exceeded'], 429);
    assert.strictEqual(ERROR_CODE_STATUS_MAP['internal_error'], 500);
    assert.strictEqual(ERROR_CODE_STATUS_MAP['unauthorized'], 401);
    assert.strictEqual(ERROR_CODE_STATUS_MAP['forbidden'], 403);
    assert.strictEqual(ERROR_CODE_STATUS_MAP['approval_required'], 202);
  });
});

describe('MapAPIError', () => {
  it('should create error with correct properties', () => {
    const error = new MapAPIError({
      code: 'agent_not_found',
      message: 'Agent not found',
      status: 404,
      retryable: false,
    });

    assert.strictEqual(error.code, 'agent_not_found');
    assert.strictEqual(error.message, 'Agent not found');
    assert.strictEqual(error.status, 404);
    assert.strictEqual(error.retryable, false);
  });

  it('should infer retryable from code when not provided', () => {
    const retryableError = new MapAPIError({
      code: 'rate_limit_exceeded',
      message: 'Rate limit exceeded',
      status: 429,
    });

    const nonRetryableError = new MapAPIError({
      code: 'agent_not_found',
      message: 'Agent not found',
      status: 404,
    });

    assert.strictEqual(retryableError.retryable, true);
    assert.strictEqual(nonRetryableError.retryable, false);
  });
});
