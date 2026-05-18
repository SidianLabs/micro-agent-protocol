/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** MAP protocol specification version. */
export const MAP_PROTOCOL_VERSION = "1.0";

/** MAP reference implementation version (read from package.json). */
export const MAP_REFERENCE_VERSION: string = (() => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
})();

export { createSystem, createReferenceApp } from "./app.js";
export { execute, type ExecuteOptions } from "./core/execute.js";
export { Executor } from "./core/execution/index.js";
export * from "./core/types.js";
export * from "./control-plane/registry.js";
export * from "./control-plane/delegation.js";
export * from "./security/signing.js";
export * from "./validation/schema-validator.js";
export * from "./sdk/client.js";
export { HttpAdapter } from "./adapters/http-adapter.js";
export type { HttpAdapterOptions } from "./adapters/http-adapter.js";
export { PaymentExecuteAdapter, PaymentRefundAdapter } from "./adapters/payment-adapter.js";
export type { PaymentAdapterOptions } from "./adapters/payment-adapter.js";
export { DbReadAdapter } from "./adapters/db-read-adapter.js";
export type { DbReadAdapterOptions, DbOutputMode } from "./adapters/db-read-adapter.js";
export { ApprovalNotifier } from "./server/approval-notifier.js";
export type { ApprovalNotification, ApprovalNotifierOptions } from "./server/approval-notifier.js";