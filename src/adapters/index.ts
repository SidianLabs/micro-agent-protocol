/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MAP Built-in Adapters
 *
 * Adapters are the execution handlers for MAP capabilities.
 * Each adapter implements the ExecutionAdapter interface.
 *
 * Usage:
 *   import { HttpAdapter, PaymentExecuteAdapter, DbReadAdapter } from './adapters/index.js';
 *
 *   const adapters = new Map([
 *     ['http.request', new HttpAdapter()],
 *     ['payment.execute', new PaymentExecuteAdapter()],
 *     ['payment.refund', new PaymentRefundAdapter()],
 *     ['db.read', new DbReadAdapter()],
 *   ]);
 */

export { HttpAdapter } from "./http-adapter.js";
export type { HttpAdapterOptions } from "./http-adapter.js";

export { PaymentExecuteAdapter, PaymentRefundAdapter } from "./payment-adapter.js";
export type { PaymentAdapterOptions } from "./payment-adapter.js";

export { DbReadAdapter } from "./db-read-adapter.js";
export type { DbReadAdapterOptions, DbOutputMode } from "./db-read-adapter.js";
