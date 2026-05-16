/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateTaskEnvelope,
  validateDispatchRequest,
  validateApprovalRequest,
  validateResultPackage,
  validateExecutionReceipt,
  validateDelegationToken,
} from '../dist/validators.js';

describe('Validators', () => {
  describe('validateTaskEnvelope', () => {
    it('should validate a valid task envelope', () => {
      const validEnvelope = {
        task_id: 'task-123',
        requester_identity: { type: 'user', id: 'user-1' },
        target_agent: 'agent-payment',
        intent: 'Process payment',
        constraints: { common: { max_amount: 1000 } },
        risk_class: 'medium',
        delegation_token: 'tok_abc123',
        requested_output_mode: 'full',
      };
      assert.doesNotThrow(() => validateTaskEnvelope(validEnvelope));
    });

    it('should throw on missing required field', () => {
      const invalidEnvelope = {
        task_id: 'task-123',
        requester_identity: { type: 'user', id: 'user-1' },
        target_agent: 'agent-payment',
      };
      assert.throws(() => validateTaskEnvelope(invalidEnvelope));
    });

    it('should throw on invalid risk_class', () => {
      const invalidEnvelope = {
        task_id: 'task-123',
        requester_identity: { type: 'user', id: 'user-1' },
        target_agent: 'agent-payment',
        intent: 'Process payment',
        constraints: {},
        risk_class: 'invalid',
        delegation_token: 'tok_abc123',
        requested_output_mode: 'full',
      };
      assert.throws(() => validateTaskEnvelope(invalidEnvelope));
    });
  });

  describe('validateDispatchRequest', () => {
    it('should validate a valid dispatch request', () => {
      const validRequest = {
        capability: 'payment.process',
        envelope: {
          task_id: 'task-123',
          requester_identity: { type: 'user', id: 'user-1' },
          target_agent: 'agent-payment',
          intent: 'Process payment',
          constraints: {},
          risk_class: 'low',
          delegation_token: 'tok_abc123',
          requested_output_mode: 'full',
        },
      };
      assert.doesNotThrow(() => validateDispatchRequest(validRequest));
    });
  });

  describe('validateApprovalRequest', () => {
    it('should validate a valid approval request', () => {
      const validRequest = {
        task_id: 'task-123',
        approval_reference: 'approval-456',
        capability: 'payment.process',
        envelope: {
          task_id: 'task-123',
          requester_identity: { type: 'user', id: 'user-1' },
          target_agent: 'agent-payment',
          intent: 'Process payment',
          constraints: {},
          risk_class: 'high',
          delegation_token: 'tok_abc123',
          requested_output_mode: 'full',
        },
      };
      assert.doesNotThrow(() => validateApprovalRequest(validRequest));
    });
  });

  describe('validateResultPackage', () => {
    it('should validate a valid result package', () => {
      const validResult = {
        task_id: 'task-123',
        status: 'completed',
        structured_output: { amount: 100, currency: 'USD' },
        followup_required: false,
      };
      assert.doesNotThrow(() => validateResultPackage(validResult));
    });

    it('should throw on invalid status', () => {
      const invalidResult = {
        task_id: 'task-123',
        status: 'invalid_status',
        structured_output: {},
        followup_required: false,
      };
      assert.throws(() => validateResultPackage(invalidResult));
    });
  });

  describe('validateExecutionReceipt', () => {
    it('should validate a valid execution receipt', () => {
      const validReceipt = {
        receipt_id: 'receipt-789',
        task_id: 'task-123',
        agent_id: 'agent-payment',
        action_taken: 'payment.process',
        resource_touched: 'payment/pay-123',
        policy_checks: ['amount_check', 'fraud_check'],
        timestamp: '2024-01-15T10:30:00Z',
        result_hash: 'hash_abc',
        signature: 'sig_xyz',
      };
      assert.doesNotThrow(() => validateExecutionReceipt(validReceipt));
    });
  });

  describe('validateDelegationToken', () => {
    it('should validate a valid delegation token', () => {
      const validToken = {
        issuer: 'user-1',
        subject_agent: 'agent-payment',
        allowed_actions: ['payment.process', 'payment.refund'],
        resource_scope: { type: 'user', id: 'user-1' },
        constraints: {
          common: { max_amount: 5000 },
          domain: { owner: 'user-1' },
          expires_at: '2025-12-31T23:59:59Z'
        },
        signature: 'sig_abc',
      };
      assert.doesNotThrow(() => validateDelegationToken(validToken));
    });
  });
});