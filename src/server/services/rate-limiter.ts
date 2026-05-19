/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { persistRateLimitState } from "../state.js";

export interface RateLimiterOptions {
  rateLimitStatePath?: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests?: number;
  rateLimitMaxRequestsPerTenant?: number;
  hydratedGlobalEvents?: number[];
  hydratedTenantEvents?: Map<string, number[]>;
}

export class RateLimiter {
  private readonly globalRateLimitEvents: number[];
  private readonly tenantRateLimitEvents: Map<string, number[]>;
  private readonly rateLimitWindowMs: number;
  private readonly rateLimitStatePath?: string;
  private readonly rateLimitMaxRequests?: number;
  private readonly rateLimitMaxRequestsPerTenant?: number;

  constructor(opts: RateLimiterOptions) {
    this.rateLimitStatePath = opts.rateLimitStatePath;
    this.rateLimitWindowMs = opts.rateLimitWindowMs;
    this.rateLimitMaxRequests = opts.rateLimitMaxRequests;
    this.rateLimitMaxRequestsPerTenant = opts.rateLimitMaxRequestsPerTenant;
    this.globalRateLimitEvents = opts.hydratedGlobalEvents ?? [];
    this.tenantRateLimitEvents = opts.hydratedTenantEvents ?? new Map<string, number[]>();
  }

  getGlobalEvents(): number[] {
    return this.globalRateLimitEvents;
  }

  getTenantEvents(): Map<string, number[]> {
    return this.tenantRateLimitEvents;
  }

  private consumeRateLimitSlot(
    events: number[],
    limit: number | undefined,
  ): { allowed: boolean; retryAfterMs: number } {
    if (typeof limit !== "number") return { allowed: true, retryAfterMs: 0 };

    const now = Date.now();
    let mutated = false;
    while (events.length > 0 && now - events[0] > this.rateLimitWindowMs) {
      events.shift();
      mutated = true;
    }

    if (events.length >= limit) {
      const oldest = events[0] ?? now;
      const retryAfterMs = Math.max(1, this.rateLimitWindowMs - (now - oldest));
      if (mutated) {
        persistRateLimitState(
          this.rateLimitStatePath,
          this.rateLimitWindowMs,
          this.globalRateLimitEvents,
          this.tenantRateLimitEvents,
        );
      }
      return { allowed: false, retryAfterMs };
    }

    events.push(now);
    persistRateLimitState(
      this.rateLimitStatePath,
      this.rateLimitWindowMs,
      this.globalRateLimitEvents,
      this.tenantRateLimitEvents,
    );
    return { allowed: true, retryAfterMs: 0 };
  }

  checkMutationRateLimit(tenantId?: string): {
    allowed: boolean;
    scope?: "global" | "tenant";
    retryAfterMs?: number;
  } {
    const globalLimit = this.consumeRateLimitSlot(
      this.globalRateLimitEvents,
      this.rateLimitMaxRequests,
    );
    if (!globalLimit.allowed) {
      return {
        allowed: false,
        scope: "global",
        retryAfterMs: globalLimit.retryAfterMs,
      };
    }

    if (tenantId && typeof this.rateLimitMaxRequestsPerTenant === "number") {
      const events = this.tenantRateLimitEvents.get(tenantId) ?? [];
      const tenantLimit = this.consumeRateLimitSlot(
        events,
        this.rateLimitMaxRequestsPerTenant,
      );
      this.tenantRateLimitEvents.set(tenantId, events);
      if (!tenantLimit.allowed) {
        return {
          allowed: false,
          scope: "tenant",
          retryAfterMs: tenantLimit.retryAfterMs,
        };
      }
    }

    return { allowed: true };
  }
}
