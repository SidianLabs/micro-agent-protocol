/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Rate limiting middleware for MAP mutation endpoints.
 *
 * Supports both global and per-tenant rate limiting using sliding windows.
 * Rate limit state is persisted to disk for durability across restarts.
 */

export interface RateLimitResult {
  allowed: boolean;
  scope?: "global" | "tenant";
  retryAfterMs?: number;
}

export interface RateLimitMiddlewareOptions {
  /** Global rate limit events (timestamps) */
  globalEvents: number[];
  /** Per-tenant rate limit events */
  tenantEvents: Map<string, number[]>;
  /** Maximum requests in the sliding window (global) */
  maxRequests?: number;
  /** Maximum requests per tenant in the sliding window */
  maxRequestsPerTenant?: number;
  /** Sliding window duration in milliseconds */
  windowMs: number;
  /** Optional tenant ID for per-tenant rate limiting */
  tenantId?: string;
  /** Callback to persist rate limit state to disk */
  persistState: () => void;
}

/**
 * Consume a single rate limit slot from the sliding window.
 * Returns whether the request is allowed and, if not, how long to wait.
 */
export function consumeRateLimitSlot(
  events: number[],
  limit: number | undefined,
  windowMs: number,
  persistState: () => void,
): {
  allowed: boolean;
  retryAfterMs: number;
} {
  if (typeof limit !== "number") return { allowed: true, retryAfterMs: 0 };

  const now = Date.now();
  let mutated = false;
  while (events.length > 0 && now - events[0] > windowMs) {
    events.shift();
    mutated = true;
  }

  if (events.length >= limit) {
    const oldest = events[0] ?? now;
    const retryAfterMs = Math.max(1, windowMs - (now - oldest));
    if (mutated) persistState();
    return { allowed: false, retryAfterMs };
  }

  events.push(now);
  persistState();
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Rate limit middleware for mutation endpoints.
 *
 * Checks both global and per-tenant rate limits.
 * Returns the combined result indicating if the request is allowed.
 */
export function rateLimitMiddleware(
  options: RateLimitMiddlewareOptions,
): RateLimitResult {
  const {
    globalEvents,
    tenantEvents,
    maxRequests,
    maxRequestsPerTenant,
    windowMs,
    tenantId,
    persistState,
  } = options;

  // Check global rate limit
  const globalResult = consumeRateLimitSlot(
    globalEvents,
    maxRequests,
    windowMs,
    persistState,
  );
  if (!globalResult.allowed) {
    return {
      allowed: false,
      scope: "global",
      retryAfterMs: globalResult.retryAfterMs,
    };
  }

  // Check per-tenant rate limit
  if (
    tenantId &&
    typeof maxRequestsPerTenant === "number" &&
    maxRequestsPerTenant > 0
  ) {
    const events = tenantEvents.get(tenantId) ?? [];
    const tenantResult = consumeRateLimitSlot(
      events,
      maxRequestsPerTenant,
      windowMs,
      persistState,
    );
    tenantEvents.set(tenantId, events);
    if (!tenantResult.allowed) {
      return {
        allowed: false,
        scope: "tenant",
        retryAfterMs: tenantResult.retryAfterMs,
      };
    }
  }

  return { allowed: true };
}
