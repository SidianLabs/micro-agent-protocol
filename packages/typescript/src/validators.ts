/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  approvalRequestSchema,
  delegationTokenSchema,
  dispatchRequestSchema,
  executionReceiptSchema,
  resultPackageSchema,
  taskEnvelopeSchema,
} from './generated-schemas.js';

// Create AJV instance with formats
const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false,
  logger: false,
});
addFormats(ajv);

// Compile validators
const taskEnvelopeValidator = ajv.compile(taskEnvelopeSchema);
const dispatchRequestValidator = ajv.compile(dispatchRequestSchema);
const approvalRequestValidator = ajv.compile(approvalRequestSchema);
const resultPackageValidator = ajv.compile(resultPackageSchema);
const executionReceiptValidator = ajv.compile(executionReceiptSchema);
const delegationTokenValidator = ajv.compile(delegationTokenSchema);

/**
 * Validate a task envelope
 */
export function validateTaskEnvelope(input: unknown): void {
  if (!taskEnvelopeValidator(input)) {
    throw new Error(`Invalid MAP task envelope: ${ajv.errorsText(taskEnvelopeValidator.errors)}`);
  }
}

/**
 * Validate a dispatch request
 */
export function validateDispatchRequest(input: unknown): void {
  if (!dispatchRequestValidator(input)) {
    throw new Error(`Invalid MAP dispatch request: ${ajv.errorsText(dispatchRequestValidator.errors)}`);
  }
}

/**
 * Validate an approval request
 */
export function validateApprovalRequest(input: unknown): void {
  if (!approvalRequestValidator(input)) {
    throw new Error(`Invalid MAP approval request: ${ajv.errorsText(approvalRequestValidator.errors)}`);
  }
}

/**
 * Validate a result package
 */
export function validateResultPackage(input: unknown): void {
  if (!resultPackageValidator(input)) {
    throw new Error(`Invalid MAP result package: ${ajv.errorsText(resultPackageValidator.errors)}`);
  }
}

/**
 * Validate an execution receipt
 */
export function validateExecutionReceipt(input: unknown): void {
  if (!executionReceiptValidator(input)) {
    throw new Error(`Invalid MAP execution receipt: ${ajv.errorsText(executionReceiptValidator.errors)}`);
  }
}

/**
 * Validate a delegation token
 */
export function validateDelegationToken(input: unknown): void {
  if (!delegationTokenValidator(input)) {
    throw new Error(`Invalid MAP delegation token: ${ajv.errorsText(delegationTokenValidator.errors)}`);
  }
}
