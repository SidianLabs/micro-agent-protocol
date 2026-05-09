import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequiredAuthScheme, getSignedRequestError } from "./auth.js";
import { extractTargetAgent, extractTenantId, wantsSignedRequestAuth } from "./utils.js";

interface MutationRouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  routeTargetAgent?: string;
  routeTenantId?: string;
  options: {
    enforceSignedRequests?: boolean;
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
        }
      ): Promise<any>;
      approve(payload: unknown): Promise<any>;
    };
  };
  disabledAgents: Map<string, { disabled_at: string; disabled_by: string; reason?: string }>;
  disabledCapabilities: Map<string, Map<string, { disabled_at: string; disabled_by: string; reason?: string }>>;
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
  validateApprovalRequest(parsed: unknown): {
    envelope: { target_agent: string; metadata?: Record<string, unknown> };
    capability: string;
    requested_schema_version?: string;
    negotiation?: {
      schema_version?: string;
      delivery_mode?: "sync" | "async";
    };
  };
  getEffectiveRevokedKeyIds(): Set<string>;
  checkMutationRateLimit(tenantId?: string): {
    allowed: boolean;
    scope?: "global" | "tenant";
    retryAfterMs?: number;
  };
  recordAuditEvent(event: {
    timestamp: string;
    request_id: string;
    code: string;
    message: string;
    method: string;
    route: string;
    tenant_id?: string;
    target_agent?: string;
  }): void;
  recordCapabilityLatency(capability: string, durationMs: number): void;
  sendJson(
    res: ServerResponse,
    statusCode: number,
    body: unknown,
    requestId: string,
    tracking?: { ok: boolean; errorCode?: string; targetAgent?: string },
    extraHeaders?: Record<string, string>
  ): void;
  sendError(
    res: ServerResponse,
    statusCode: number,
    requestId: string,
    error: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> },
    targetAgent?: string
  ): void;
}

export async function handleMutationRoutes(
  ctx: MutationRouteContext
): Promise<{ handled: boolean; routeTargetAgent?: string; routeTenantId?: string }> {
  const { req, res, requestId } = ctx;

  if (req.method === "POST" && req.url === "/dispatch") {
    const body = await ctx.readJsonBody(req);
    let routeTargetAgent = extractTargetAgent(body.parsed);
    let routeTenantId = extractTenantId(body.parsed);
    const dispatchRateLimit = ctx.checkMutationRateLimit(routeTenantId);
    if (!dispatchRateLimit.allowed) {
      ctx.recordAuditEvent({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        code: "rate_limited",
        message: "Rate limit exceeded for MAP mutating requests.",
        method: req.method,
        route: "/dispatch",
        tenant_id: routeTenantId,
        target_agent: routeTargetAgent
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
            retry_after_ms: dispatchRateLimit.retryAfterMs ?? 0
          }
        },
        routeTargetAgent
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }

    const payload = ctx.validateDispatchRequest(body.parsed);
    routeTargetAgent = payload.envelope.target_agent;
    if (ctx.isAgentDisabled(payload.envelope.target_agent)) {
      const disabledInfo = ctx.disabledAgents.get(payload.envelope.target_agent);
      const message = `Target agent is disabled in runtime controls: ${payload.envelope.target_agent}`;
      ctx.recordAuditEvent({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        code: "agent_disabled",
        message,
        method: req.method,
        route: "/dispatch",
        tenant_id: routeTenantId,
        target_agent: routeTargetAgent
      });
      ctx.sendError(
        res,
        403,
        requestId,
        {
          code: "agent_disabled",
          message,
          retryable: false,
          details: disabledInfo ? { disabled: disabledInfo } : undefined
        },
        routeTargetAgent
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }

    if (ctx.isCapabilityDisabled(payload.envelope.target_agent, payload.capability)) {
      const disabledInfo = ctx.disabledCapabilities.get(payload.envelope.target_agent)?.get(payload.capability);
      const message = `Capability is disabled in runtime controls: ${payload.capability}`;
      ctx.recordAuditEvent({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        code: "capability_disabled",
        message,
        method: req.method,
        route: "/dispatch",
        tenant_id: routeTenantId,
        target_agent: routeTargetAgent
      });
      ctx.sendError(
        res,
        403,
        requestId,
        {
          code: "capability_disabled",
          message,
          retryable: false,
          details: disabledInfo ? { disabled: disabledInfo } : undefined
        },
        routeTargetAgent
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }

    const requiredAuthScheme = ctx.options.enforceSignedRequests
      ? "signed_request"
      : getRequiredAuthScheme(ctx.app as never, payload.envelope.target_agent, payload.capability);
    const requiresSignedRequest =
      requiredAuthScheme === "signed_request" || wantsSignedRequestAuth(req);
    if (requiresSignedRequest) {
      const authError = getSignedRequestError(req, body.raw, ctx.getEffectiveRevokedKeyIds());
      if (authError) {
        ctx.recordAuditEvent({
          timestamp: new Date().toISOString(),
          request_id: requestId,
          code: authError.code,
          message: authError.message,
          method: req.method,
          route: "/dispatch",
          tenant_id: routeTenantId,
          target_agent: routeTargetAgent
        });
        ctx.sendError(
          res,
          authError.code === "auth_required" ? 401 : 403,
          requestId,
          { ...authError, retryable: false },
          routeTargetAgent
        );
        return { handled: true, routeTargetAgent, routeTenantId };
      }
    }

    const headerIdempotencyKey = req.headers["x-map-idempotency-key"];
    const idempotencyKey =
      typeof headerIdempotencyKey === "string" && headerIdempotencyKey.trim().length > 0
        ? headerIdempotencyKey
        : undefined;
    const envelopeWithRequestId = {
      ...payload.envelope,
      metadata: {
        ...(payload.envelope.metadata ?? {}),
        request_id: requestId,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
      }
    };
    const startedAt = Date.now();
    const result = await ctx.app.orchestrator.dispatch(
      envelopeWithRequestId,
      payload.capability,
      payload.requested_schema_version,
      payload.negotiation
    );
    ctx.recordCapabilityLatency(payload.capability, Date.now() - startedAt);
    const statusCode =
      result.result.status === "awaiting_approval" || result.result.status === "running" ? 202 : 200;
    ctx.sendJson(res, statusCode, result, requestId);
    return { handled: true, routeTargetAgent, routeTenantId };
  }

  if (req.method === "POST" && req.url === "/approve") {
    const body = await ctx.readJsonBody(req);
    let routeTargetAgent = extractTargetAgent(body.parsed);
    let routeTenantId = extractTenantId(body.parsed);
    const approvalRateLimit = ctx.checkMutationRateLimit(routeTenantId);
    if (!approvalRateLimit.allowed) {
      ctx.recordAuditEvent({
        timestamp: new Date().toISOString(),
        request_id: requestId,
        code: "rate_limited",
        message: "Rate limit exceeded for MAP mutating requests.",
        method: req.method,
        route: "/approve",
        tenant_id: routeTenantId,
        target_agent: routeTargetAgent
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
            scope: approvalRateLimit.scope,
            retry_after_ms: approvalRateLimit.retryAfterMs ?? 0
          }
        },
        routeTargetAgent
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }

    const payload = ctx.validateApprovalRequest(body.parsed);
    routeTargetAgent = payload.envelope.target_agent;
    if (ctx.isAgentDisabled(payload.envelope.target_agent)) {
      const disabledInfo = ctx.disabledAgents.get(payload.envelope.target_agent);
      ctx.sendError(
        res,
        403,
        requestId,
        {
          code: "agent_disabled",
          message: `Target agent is disabled in runtime controls: ${payload.envelope.target_agent}`,
          retryable: false,
          details: disabledInfo ? { disabled: disabledInfo } : undefined
        },
        routeTargetAgent
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }

    if (ctx.isCapabilityDisabled(payload.envelope.target_agent, payload.capability)) {
      const disabledInfo = ctx.disabledCapabilities.get(payload.envelope.target_agent)?.get(payload.capability);
      ctx.sendError(
        res,
        403,
        requestId,
        {
          code: "capability_disabled",
          message: `Capability is disabled in runtime controls: ${payload.capability}`,
          retryable: false,
          details: disabledInfo ? { disabled: disabledInfo } : undefined
        },
        routeTargetAgent
      );
      return { handled: true, routeTargetAgent, routeTenantId };
    }

    const requiredAuthScheme = ctx.options.enforceSignedRequests
      ? "signed_request"
      : getRequiredAuthScheme(ctx.app as never, payload.envelope.target_agent, payload.capability);
    const requiresSignedRequest =
      requiredAuthScheme === "signed_request" || wantsSignedRequestAuth(req);
    if (requiresSignedRequest) {
      const authError = getSignedRequestError(req, body.raw, ctx.getEffectiveRevokedKeyIds());
      if (authError) {
        ctx.recordAuditEvent({
          timestamp: new Date().toISOString(),
          request_id: requestId,
          code: authError.code,
          message: authError.message,
          method: req.method,
          route: "/approve",
          tenant_id: routeTenantId,
          target_agent: routeTargetAgent
        });
        ctx.sendError(
          res,
          authError.code === "auth_required" ? 401 : 403,
          requestId,
          { ...authError, retryable: false },
          routeTargetAgent
        );
        return { handled: true, routeTargetAgent, routeTenantId };
      }
    }

    const payloadWithRequestId = {
      ...payload,
      envelope: {
        ...payload.envelope,
        metadata: {
          ...(payload.envelope.metadata ?? {}),
          request_id: requestId
        }
      }
    };
    const startedAt = Date.now();
    const result = await ctx.app.orchestrator.approve(payloadWithRequestId);
    ctx.recordCapabilityLatency(payload.capability, Date.now() - startedAt);
    ctx.sendJson(res, 200, result, requestId);
    return { handled: true, routeTargetAgent, routeTenantId };
  }

  return {
    handled: false,
    routeTargetAgent: ctx.routeTargetAgent,
    routeTenantId: ctx.routeTenantId
  };
}
