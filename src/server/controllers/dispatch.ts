/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  extractBearerToken,
  getSignedRequestError,
  validateOAuth2Token,
} from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { backpressureMiddleware } from "../middleware/backpressure.js";
import {
  extractTargetAgent,
  extractTenantId,
  wantsSignedRequestAuth,
} from "../utils.js";
import { getRequiredAuthScheme } from "../middleware/auth.js";

export interface DispatchContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  options: {
    enforceSignedRequests?: boolean;
    enforceBearerAuth?: boolean;
  };
  app: {
    orchestrator: {
      dispatch(
        envelope: unknown,
        capability: string,
        requestedSchemaVersion?: string,
        negotiation?: {
          schema_version?: string;
          delivery_mode?: "sync" | "async";
        },
      ): Promise<any>;
    };
  };
  disabledAgents: Map<
    string,
    { disabled_at: string; disabled_by: string; reason?: string }
  >;
  disabledCapabilities: Map<
    string,
    Map<string, { disabled_at: string; disabled_by: string; reason?: string }>
  >;
  isAgentDisabled(agentId: string): boolean;
  isCapabilityDisabled(agentId: string, capability: string): boolean;
  readJsonBody(req: IncomingMessage): Promise<{ raw: string; parsed: unknown }>;
  validateDispatchRequest(parsed: unknown): {
    envelope: { target_agent: string; metadata?: Record<string, unknown> };
    capability: string;
    requested_schema_version?: string;
    negotiation?: {
      schema_version?: string;
      delivery_mode?: "sync" | "async";
    };
  };
  getEffectiveRevokedKeyIds(): Set<string>;
  getBearerTokenError(
    req: IncomingMessage,
  ): { code: string; message: string } | null;
  checkMutationRateLimit(tenantId?: string): {
    allowed: boolean;
    scope?: "global" | "tenant";
    retryAfterMs?: number;
  };
  asyncQueueMaxQueueDepth: number;
  getAsyncQueueDepth(): number;
  recordAuditEvent(event: {
    timestamp: string;
    request_id: string;
    code: string;
    message: string;
    method: string;
    route: string;
    tenant_id?: string;
    target_agent?: string;
    subject?: string;
  }): void;
  recordCapabilityLatency(capability: string, durationMs: number): void;
  sendJson(
    res: ServerResponse,
    statusCode: number,
    body: unknown,
    requestId: string,
    tracking?: { ok: boolean; errorCode?: string; targetAgent?: string },
    extraHeaders?: Record<string, string>,
  ): void;
  sendError(
    res: ServerResponse,
    statusCode: number,
    requestId: string,
    error: {
      code: string;
      message: string;
      retryable: boolean;
      details?: Record<string, unknown>;
    },
    targetAgent?: string,
  ): void;
  rateLimitWindowMs: number;
  globalRateLimitEvents: number[];
  tenantRateLimitEvents: Map<string, number[]>;
  persistRateLimitState: () => void;
  rateLimitMaxRequests?: number;
  rateLimitMaxRequestsPerTenant?: number;
}

export async function handleDispatch(ctx: DispatchContext): Promise<{
  handled: boolean;
  routeTargetAgent?: string;
  routeTenantId?: string;
}> {
  const { req, res, requestId } = ctx;

  const body = await ctx.readJsonBody(req);
  let routeTargetAgent = extractTargetAgent(body.parsed);
  const routeTenantId = extractTenantId(body.parsed);

  // Track the authenticated subject for audit logging
  let authSubject: string | undefined;

  // --- Deterministic overload backpressure ---
  const queueStats = {
    queue_depth: ctx.getAsyncQueueDepth(),
    max_queue_depth: ctx.asyncQueueMaxQueueDepth,
  };
  const backpressureResult = backpressureMiddleware(queueStats);

  if (!backpressureResult.allowed) {
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "rate_limited",
      message: "Async queue capacity exceeded. Rejecting new task.",
      method: req.method ?? "POST",
      route: "/dispatch",
      tenant_id: routeTenantId,
      target_agent: routeTargetAgent,
      subject: authSubject,
    });
    ctx.sendError(
      res,
      429,
      requestId,
      {
        code: "rate_limited",
        message: "Async queue is at critical capacity. Please retry later.",
        retryable: true,
        details: {
          category: "throttling",
          scope: "global",
          retry_after_ms: 5000,
        },
      },
      routeTargetAgent,
    );
    return { handled: true, routeTargetAgent, routeTenantId };
  }

  const warningHeaders: Record<string, string> = {
    ...(backpressureResult.headers ?? {}),
  };
  // --- End backpressure ---

  // Rate limiting
  const dispatchRateLimit = rateLimitMiddleware({
    globalEvents: ctx.globalRateLimitEvents,
    tenantEvents: ctx.tenantRateLimitEvents,
    maxRequests: ctx.rateLimitMaxRequests,
    maxRequestsPerTenant: ctx.rateLimitMaxRequestsPerTenant,
    windowMs: ctx.rateLimitWindowMs,
    tenantId: routeTenantId,
    persistState: ctx.persistRateLimitState,
  });

  if (!dispatchRateLimit.allowed) {
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "rate_limited",
      message: "Rate limit exceeded for MAP mutating requests.",
      method: req.method ?? "POST",
      route: "/dispatch",
      tenant_id: routeTenantId,
      target_agent: routeTargetAgent,
      subject: authSubject,
    });
    ctx.sendError(
      res,
      429,
      requestId,
      {
        code: "rate_limited",
        message: "Rate limit exceeded for MAP mutating requests.",
        retryable: true,
        details: {
          category: "throttling",
          scope: dispatchRateLimit.scope,
          retry_after_ms: dispatchRateLimit.retryAfterMs ?? 0,
        },
      },
      routeTargetAgent,
    );
    return { handled: true, routeTargetAgent, routeTenantId };
  }

  const payload = ctx.validateDispatchRequest(body.parsed);
  routeTargetAgent = payload.envelope.target_agent;

  // Check if agent is disabled
  if (ctx.isAgentDisabled(payload.envelope.target_agent)) {
    const disabledInfo = ctx.disabledAgents.get(payload.envelope.target_agent);
    const message = `Target agent is disabled in runtime controls: ${payload.envelope.target_agent}`;
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "agent_disabled",
      message,
      method: req.method ?? "POST",
      route: "/dispatch",
      tenant_id: routeTenantId,
      target_agent: routeTargetAgent,
      subject: authSubject,
    });
    ctx.sendError(
      res,
      403,
      requestId,
      {
        code: "agent_disabled",
        message,
        retryable: false,
        details: disabledInfo ? { disabled: disabledInfo } : undefined,
      },
      routeTargetAgent,
    );
    return { handled: true, routeTargetAgent, routeTenantId };
  }

  // Check if capability is disabled
  if (
    ctx.isCapabilityDisabled(payload.envelope.target_agent, payload.capability)
  ) {
    const disabledInfo = ctx.disabledCapabilities
      .get(payload.envelope.target_agent)
      ?.get(payload.capability);
    const message = `Capability is disabled in runtime controls: ${payload.capability}`;
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "capability_disabled",
      message,
      method: req.method ?? "POST",
      route: "/dispatch",
      tenant_id: routeTenantId,
      target_agent: routeTargetAgent,
      subject: authSubject,
    });
    ctx.sendError(
      res,
      403,
      requestId,
      {
        code: "capability_disabled",
        message,
        retryable: false,
        details: disabledInfo ? { disabled: disabledInfo } : undefined,
      },
      routeTargetAgent,
    );
    return { handled: true, routeTargetAgent, routeTenantId };
  }

  // Authentication
  const requiredAuthScheme = ctx.options.enforceSignedRequests
    ? "signed_request"
    : getRequiredAuthScheme(
        ctx.app as never,
        payload.envelope.target_agent,
        payload.capability,
      );
  const requiresSignedRequest =
    requiredAuthScheme === "signed_request" || wantsSignedRequestAuth(req);

  // If enforceBearerAuth is true and signed_request is not present, fall back to bearer token
  if (
    ctx.options.enforceBearerAuth &&
    !wantsSignedRequestAuth(req) &&
    requiredAuthScheme !== "signed_request"
  ) {
    const bearerError = ctx.getBearerTokenError(req);
    if (bearerError) {
      ctx.recordAuditEvent({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        code: bearerError.code,
        message: bearerError.message,
        method: req.method ?? "POST",
        route: "/dispatch",
        tenant_id: routeTenantId,
        target_agent: routeTargetAgent,
        subject: authSubject,
      });
      ctx.sendError(
        res,
        bearerError.code === "auth_required" ? 401 : 403,
        requestId,
        { ...bearerError, retryable: false },
        routeTargetAgent,
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }

    // When Bearer token is used, validate with OAuth 2.0 and log the subject
    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
      try {
        const oauth2Result = await validateOAuth2Token(bearerToken);
        if (oauth2Result.valid && oauth2Result.sub) {
          authSubject = oauth2Result.sub;
          console.log(
            `[MAP] OAuth2 authenticated subject: ${authSubject}` +
              (oauth2Result.scopes
                ? ` (scopes: ${oauth2Result.scopes.join(", ")})`
                : ""),
          );
        }
      } catch {
        // Non-fatal: proceed even if OAuth2 validation fails
      }
    }
  } else if (requiresSignedRequest) {
    const authError = getSignedRequestError(
      req,
      body.raw,
      ctx.getEffectiveRevokedKeyIds(),
    );
    if (authError) {
      ctx.recordAuditEvent({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        code: authError.code,
        message: authError.message,
        method: req.method ?? "POST",
        route: "/dispatch",
        tenant_id: routeTenantId,
        target_agent: routeTargetAgent,
        subject: authSubject,
      });
      ctx.sendError(
        res,
        authError.code === "auth_required" ? 401 : 403,
        requestId,
        { ...authError, retryable: false },
        routeTargetAgent,
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }
  }

  // Idempotency key
  const headerIdempotencyKey = req.headers["x-map-idempotency-key"];
  const idempotencyKey =
    typeof headerIdempotencyKey === "string" &&
    headerIdempotencyKey.trim().length > 0
      ? headerIdempotencyKey
      : undefined;

  const envelopeWithRequestId = {
    ...payload.envelope,
    metadata: {
      ...(payload.envelope.metadata ?? {}),
      request_id: requestId,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    },
  };

  const startedAt = Date.now();
  const result = await ctx.app.orchestrator.dispatch(
    envelopeWithRequestId,
    payload.capability,
    payload.requested_schema_version,
    payload.negotiation,
  );
  ctx.recordCapabilityLatency(payload.capability, Date.now() - startedAt);

  const statusCode =
    result.result.status === "awaiting_approval" ||
    result.result.status === "running"
      ? 202
      : 200;

  ctx.sendJson(res, statusCode, result, requestId, undefined, warningHeaders);
  return { handled: true, routeTargetAgent, routeTenantId };
}
