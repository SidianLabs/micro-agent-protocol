/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deterministic overload backpressure middleware.
 *
 * Gracefully degrades instead of crashing when the system is overloaded.
 * Uses queue depth ratio thresholds to determine when to warn or reject.
 */

/** Backpressure threshold constants */
export const BACKPRESSURE = {
  /** 70% queue full → emit warning header */
  queue_warning: 0.7,
  /** 90% queue full → reject new tasks */
  queue_critical: 0.9,
  /** 80% max concurrent → slow down */
  inflight_warning: 0.8,
  /** 100% max concurrent → reject */
  inflight_critical: 1.0,
} as const;

export interface QueueStats {
  queue_depth: number;
  max_queue_depth: number;
  [key: string]: unknown;
}

export interface BackpressureResult {
  allowed: boolean;
  /** Warning message if approaching capacity */
  warning?: string;
  /** Retry-after value in seconds if rejected */
  retryAfter?: string;
  /** Extra headers to include in the response */
  headers?: Record<string, string>;
}

/**
 * Backpressure middleware that checks queue capacity.
 *
 * @param queueStats - Current queue statistics including depth and max depth
 * @returns BackpressureResult indicating if the request can proceed
 */
export function backpressureMiddleware(
  queueStats: QueueStats,
): BackpressureResult {
  const { queue_depth: queueDepth, max_queue_depth: maxDepth } = queueStats;
  const queueRatio = maxDepth > 0 ? queueDepth / maxDepth : 0;
  const queueDepthHeader = { "x-map-queue-depth": String(queueDepth) };

  // Critical: reject new tasks
  if (queueRatio >= BACKPRESSURE.queue_critical) {
    return {
      allowed: false,
      retryAfter: "5",
      headers: {
        "retry-after": "5",
        ...queueDepthHeader,
      },
    };
  }

  // Warning: approaching capacity
  const headers: Record<string, string> = { ...queueDepthHeader };
  if (queueRatio >= BACKPRESSURE.queue_warning) {
    headers["x-map-warning"] = "queue_nearing_capacity";
    return {
      allowed: true,
      warning: "queue_nearing_capacity",
      headers,
    };
  }

  return {
    allowed: true,
    headers: queueDepthHeader,
  };
}
