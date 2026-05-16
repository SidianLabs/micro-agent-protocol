/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExecutionReceipt, ExecutionResult } from "../types.js";

export function generateReceiptId(intentId: string): string {
  return `receipt:${intentId}:${Date.now()}`;
}

export function createReceipt(
  intentId: string,
  capability: string,
  action: ExecutionReceipt["action"],
  status: ExecutionReceipt["status"]
): Omit<ExecutionReceipt, "signature"> {
  return {
    receipt_id: generateReceiptId(intentId),
    intent_id: intentId,
    capability,
    action,
    timestamp: new Date().toISOString(),
    status,
  };
}

export function createResult(
  intentId: string,
  capability: string,
  status: ExecutionResult["status"],
  output: Record<string, unknown>,
  summary: string
): ExecutionResult {
  return {
    intent_id: intentId,
    capability,
    status,
    output,
    summary,
  };
}