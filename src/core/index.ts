/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

export { execute, type ExecuteOptions } from "./execute.js";
export { Executor } from "./execution/index.js";
export * from "./types.js";

export type {
  Intent,
  PolicyDocument,
  ExecutionResult,
  ExecutionReceipt,
  ExecutionAdapter,
  ExecutionContext,
  ValidationResult,
  RequesterIdentity,
  PolicyDecision,
} from "./types.js";

export { validate, normalize } from "./intent/index.js";
export { evaluate } from "./policy/index.js";
export { createReceipt, createResult, generateReceiptId } from "./audit/index.js";