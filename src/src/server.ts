/**
 * Backward-compatibility re-export.
 *
 * All implementation has moved to ./server/index.js.
 * Consumers should prefer importing from ./server/index.js directly.
 */

export {
  createMapHandler,
  createMapServer,
  resolveServerOptionsFromEnv,
} from "./server/index.js";

export type {
  MapHttpServerOptions,
  PersistedMetricsState,
  PersistedRateLimitState,
  RuntimeControlState,
  DeploymentProfileEvaluation,
  AlertRecord,
  AuditEvent,
  AuditCheckpoint,
} from "./server/types.js";

// Re-export checkWritableFilePath for consumers that previously imported
// it from ./utils.js (kept for backward-compat).
export { checkWritableFilePath } from "./server/persistence.js";
