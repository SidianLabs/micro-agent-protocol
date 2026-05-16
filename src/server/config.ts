import type { MapHttpServerOptions } from "./types.js";

function parseOptionalNumber(value: string | undefined): number | undefined {
  return value !== undefined ? Number(value) : undefined;
}

export function resolveServerOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MapHttpServerOptions & { port: number } {
  const deploymentProfile =
    env.MAP_DEPLOYMENT_PROFILE === "regulated"
      ? "regulated"
      : env.MAP_DEPLOYMENT_PROFILE === "verified"
        ? "verified"
        : "open";

  return {
    port: Number(env.PORT ?? 8787),
    deploymentProfile,
    taskStorePath: env.MAP_TASK_STORE_PATH ?? ".map/task-store.json",
    taskStoreDbPath: env.MAP_TASK_DB_PATH,
    receiptStorePath: env.MAP_RECEIPT_STORE_PATH ?? ".map/receipts.json",
    receiptStoreDbPath: env.MAP_RECEIPT_DB_PATH,
    deadLetterStorePath:
      env.MAP_DEAD_LETTER_STORE_PATH ?? ".map/dead-letters.json",
    requireTenant: env.MAP_REQUIRE_TENANT === "true",
    asyncQueueMaxAttempts: Number(env.MAP_ASYNC_MAX_ATTEMPTS ?? 3),
    asyncQueueRetryDelayMs: Number(env.MAP_ASYNC_RETRY_DELAY_MS ?? 50),
    asyncQueueMaxRetryDelayMs: Number(
      env.MAP_ASYNC_MAX_RETRY_DELAY_MS ?? 5_000,
    ),
    asyncQueueRetryJitterRatio: Number(env.MAP_ASYNC_RETRY_JITTER_RATIO ?? 0.2),
    asyncQueueMaxConcurrent: Number(env.MAP_ASYNC_MAX_CONCURRENT ?? 4),
    asyncQueueMaxConcurrentPerTenant: parseOptionalNumber(
      env.MAP_ASYNC_MAX_CONCURRENT_PER_TENANT,
    ),
    asyncQueueMaxQueueDepth: Number(env.MAP_ASYNC_MAX_QUEUE_DEPTH ?? 1_000),
    asyncQueueMaxDeadLetters: Number(env.MAP_ASYNC_MAX_DEAD_LETTERS ?? 500),
    healthMaxDeadLetters: parseOptionalNumber(env.MAP_HEALTH_MAX_DEAD_LETTERS),
    healthMaxOldestDeadLetterAgeMs: parseOptionalNumber(
      env.MAP_HEALTH_MAX_OLDEST_DL_AGE_MS,
    ),
    metricsFailureRateThreshold: parseOptionalNumber(
      env.MAP_METRICS_FAILURE_RATE_THRESHOLD,
    ),
    metricsStorePath: env.MAP_METRICS_STORE_PATH ?? ".map/metrics.json",
    rateLimitWindowMs: parseOptionalNumber(env.MAP_RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: parseOptionalNumber(env.MAP_RATE_LIMIT_MAX_REQUESTS),
    rateLimitMaxRequestsPerTenant: parseOptionalNumber(
      env.MAP_RATE_LIMIT_MAX_REQUESTS_PER_TENANT,
    ),
    auditStorePath: env.MAP_AUDIT_STORE_PATH ?? ".map/audit-events.json",
    alertStorePath: env.MAP_ALERT_STORE_PATH ?? ".map/alerts.json",
    runtimeControlStorePath:
      env.MAP_RUNTIME_CONTROL_STORE_PATH ?? ".map/runtime-controls.json",
    auditMaxEvents: parseOptionalNumber(env.MAP_AUDIT_MAX_EVENTS),
    auditCheckpointInterval: parseOptionalNumber(
      env.MAP_AUDIT_CHECKPOINT_INTERVAL,
    ),
    signingRetiringKeyCriticalRatio: parseOptionalNumber(
      env.MAP_SIGNING_RETIRING_KEY_CRITICAL_RATIO,
    ),
    signingUnknownKeyCriticalRatio: parseOptionalNumber(
      env.MAP_SIGNING_UNKNOWN_KEY_CRITICAL_RATIO,
    ),
    policyFilePath: env.MAP_POLICY_PATH,
    approvalWebhookUrl: env.MAP_APPROVAL_WEBHOOK_URL,
    serverBaseUrl: env.MAP_SERVER_BASE_URL,
  };
}
