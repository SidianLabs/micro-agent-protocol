import type { IncomingMessage, ServerResponse } from "node:http";
import { getActiveSignatureKeyId, getSigningProviderStatus, getTrustMetadata } from "../security/signing.js";

interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  deploymentProfile: "open" | "verified" | "regulated";
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
  readJsonBody(req: IncomingMessage): Promise<{ raw: string; parsed: unknown }>;
  getAdminTokenError(
    req: IncomingMessage,
    rawBody: string
  ): { statusCode: number; code: string; message: string } | null;
  snapshotRuntimeControls(): {
    disabled_agents: Record<string, unknown>;
    disabled_capabilities: Record<string, Record<string, unknown>>;
    revoked_keys: Record<string, unknown>;
  };
  getEffectiveVerificationKeys(): any[];
  getRuntimeRevocationMetadata(
    keyId: string
  ): { revoked_at: string; revoked_by: string; reason?: string } | null;
  disabledAgents: Map<string, { disabled_at: string; disabled_by: string; reason?: string }>;
  disabledCapabilities: Map<string, Map<string, { disabled_at: string; disabled_by: string; reason?: string }>>;
  revokedSigningKeys: Map<string, { revoked_at: string; revoked_by: string; reason?: string }>;
  persistRuntimeControls(): void;
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
}

async function requireAdmin(ctx: RouteContext): Promise<{ parsed: unknown; pathname: string } | null> {
  const body = await ctx.readJsonBody(ctx.req);
  const adminError = ctx.getAdminTokenError(ctx.req, body.raw);
  if (adminError) {
    ctx.sendError(ctx.res, adminError.statusCode, ctx.requestId, {
      code: adminError.code,
      message: adminError.message,
      retryable: false
    });
    return null;
  }
  return {
    parsed: body.parsed,
    pathname: new URL(ctx.req.url ?? "/", "http://localhost").pathname
  };
}

export async function handleAdminRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, requestId } = ctx;

  if (req.method === "GET" && req.url?.startsWith("/admin/runtime-controls")) {
    const adminError = ctx.getAdminTokenError(req, "");
    if (adminError) {
      ctx.sendError(res, adminError.statusCode, requestId, {
        code: adminError.code,
        message: adminError.message,
        retryable: false
      });
      return true;
    }
    const requestUrl = new URL(req.url, "http://localhost");
    const controls = ctx.snapshotRuntimeControls();
    const includeKeys = requestUrl.searchParams.get("include_keys") !== "false";
    ctx.sendJson(
      res,
      200,
      {
        controls: {
          disabled_agents: controls.disabled_agents,
          disabled_capabilities: controls.disabled_capabilities,
          ...(includeKeys ? { revoked_keys: controls.revoked_keys } : {})
        },
        summary: {
          disabled_agents_count: Object.keys(controls.disabled_agents).length,
          disabled_capabilities_count: Object.values(controls.disabled_capabilities).reduce(
            (acc, item) => acc + Object.keys(item).length,
            0
          ),
          revoked_keys_count: Object.keys(controls.revoked_keys).length
        }
      },
      requestId
    );
    return true;
  }

  if (req.method === "GET" && req.url?.startsWith("/admin/keys")) {
    const admin = await requireAdmin(ctx);
    if (!admin) {
      return true;
    }
    if (admin.pathname !== "/admin/keys") {
      ctx.sendError(res, 404, requestId, {
        code: "not_found",
        message: "Resource not found.",
        retryable: false
      });
      return true;
    }
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const includeRuntime = requestUrl.searchParams.get("include_runtime") !== "false";
    const includeRevoked = requestUrl.searchParams.get("include_revoked") !== "false";
    const activeKid = getActiveSignatureKeyId();
    const keys = ctx.getEffectiveVerificationKeys()
      .filter((key) => includeRevoked || key.status !== "revoked")
      .sort((a, b) => a.kid.localeCompare(b.kid))
      .map((key) => {
        const runtimeRevocation = includeRuntime ? ctx.getRuntimeRevocationMetadata(key.kid) : null;
        return {
          ...key,
          is_active: key.kid === activeKid,
          signable: key.status !== "revoked",
          status_source: runtimeRevocation ? "runtime_revoked" : "configured",
          ...(runtimeRevocation ? { runtime_revocation: runtimeRevocation } : {})
        };
      });
    const signableKeys = keys.filter((key) => key.signable);
    ctx.sendJson(
      res,
      200,
      {
        keys,
        summary: {
          total_keys: keys.length,
          signable_keys: signableKeys.length,
          revoked_keys: keys.length - signableKeys.length,
          active_kid: activeKid,
          active_key_alg: activeKid ? keys.find((key) => key.kid === activeKid)?.alg ?? null : null,
          all_signable_keys_asymmetric: signableKeys.every((key) => key.alg === "RS256")
        },
        trust: getTrustMetadata(ctx.deploymentProfile),
        key_provider: getSigningProviderStatus()
      },
      requestId
    );
    return true;
  }

  if (req.method === "POST" && req.url?.startsWith("/admin/agents/") && req.url.endsWith("/disable")) {
    const admin = await requireAdmin(ctx);
    if (!admin) {
      return true;
    }
    const agentId = decodeURIComponent(admin.pathname.slice("/admin/agents/".length, -"/disable".length));
    const parsed = admin.parsed && typeof admin.parsed === "object" ? (admin.parsed as { actor?: unknown; reason?: unknown }) : {};
    const actor = typeof parsed.actor === "string" && parsed.actor.trim().length > 0 ? parsed.actor.trim() : "admin";
    const reason = typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : undefined;
    const disabledAt = new Date().toISOString();
    ctx.disabledAgents.set(agentId, { disabled_at: disabledAt, disabled_by: actor, ...(reason ? { reason } : {}) });
    ctx.persistRuntimeControls();
    ctx.recordAuditEvent({
      timestamp: disabledAt,
      request_id: requestId,
      code: "admin_agent_disabled",
      message: `Agent ${agentId} disabled by ${actor}${reason ? `: ${reason}` : ""}`,
      method: req.method,
      route: admin.pathname
    });
    ctx.sendJson(res, 200, { control: { type: "agent", action: "disable", agent_id: agentId, disabled_at: disabledAt, disabled_by: actor, ...(reason ? { reason } : {}) } }, requestId);
    return true;
  }

  if (req.method === "POST" && req.url?.startsWith("/admin/agents/") && req.url.endsWith("/enable")) {
    const admin = await requireAdmin(ctx);
    if (!admin) {
      return true;
    }
    const agentId = decodeURIComponent(admin.pathname.slice("/admin/agents/".length, -"/enable".length));
    const parsed = admin.parsed && typeof admin.parsed === "object" ? (admin.parsed as { actor?: unknown }) : {};
    const actor = typeof parsed.actor === "string" && parsed.actor.trim().length > 0 ? parsed.actor.trim() : "admin";
    ctx.disabledAgents.delete(agentId);
    ctx.persistRuntimeControls();
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "admin_agent_enabled",
      message: `Agent ${agentId} enabled by ${actor}`,
      method: req.method,
      route: admin.pathname
    });
    ctx.sendJson(res, 200, { control: { type: "agent", action: "enable", agent_id: agentId, actor } }, requestId);
    return true;
  }

  if (req.method === "POST" && req.url?.startsWith("/admin/agents/") && req.url.includes("/capabilities/") && req.url.endsWith("/disable")) {
    const admin = await requireAdmin(ctx);
    if (!admin) {
      return true;
    }
    const segment = admin.pathname.slice("/admin/agents/".length, -"/disable".length);
    const [encodedAgentId, encodedCapability = ""] = segment.split("/capabilities/");
    const agentId = decodeURIComponent(encodedAgentId);
    const capability = decodeURIComponent(encodedCapability);
    const parsed = admin.parsed && typeof admin.parsed === "object" ? (admin.parsed as { actor?: unknown; reason?: unknown }) : {};
    const actor = typeof parsed.actor === "string" && parsed.actor.trim().length > 0 ? parsed.actor.trim() : "admin";
    const reason = typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : undefined;
    const disabledAt = new Date().toISOString();
    const capabilityMap = ctx.disabledCapabilities.get(agentId) ?? new Map();
    capabilityMap.set(capability, { disabled_at: disabledAt, disabled_by: actor, ...(reason ? { reason } : {}) });
    ctx.disabledCapabilities.set(agentId, capabilityMap);
    ctx.persistRuntimeControls();
    ctx.recordAuditEvent({
      timestamp: disabledAt,
      request_id: requestId,
      code: "admin_capability_disabled",
      message: `Capability ${capability} for ${agentId} disabled by ${actor}${reason ? `: ${reason}` : ""}`,
      method: req.method,
      route: admin.pathname
    });
    ctx.sendJson(res, 200, { control: { type: "capability", action: "disable", agent_id: agentId, capability, disabled_at: disabledAt, disabled_by: actor, ...(reason ? { reason } : {}) } }, requestId);
    return true;
  }

  if (req.method === "POST" && req.url?.startsWith("/admin/agents/") && req.url.includes("/capabilities/") && req.url.endsWith("/enable")) {
    const admin = await requireAdmin(ctx);
    if (!admin) {
      return true;
    }
    const segment = admin.pathname.slice("/admin/agents/".length, -"/enable".length);
    const [encodedAgentId, encodedCapability = ""] = segment.split("/capabilities/");
    const agentId = decodeURIComponent(encodedAgentId);
    const capability = decodeURIComponent(encodedCapability);
    const parsed = admin.parsed && typeof admin.parsed === "object" ? (admin.parsed as { actor?: unknown }) : {};
    const actor = typeof parsed.actor === "string" && parsed.actor.trim().length > 0 ? parsed.actor.trim() : "admin";
    const capabilityMap = ctx.disabledCapabilities.get(agentId);
    capabilityMap?.delete(capability);
    if (capabilityMap && capabilityMap.size === 0) {
      ctx.disabledCapabilities.delete(agentId);
    }
    ctx.persistRuntimeControls();
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "admin_capability_enabled",
      message: `Capability ${capability} for ${agentId} enabled by ${actor}`,
      method: req.method,
      route: admin.pathname
    });
    ctx.sendJson(res, 200, { control: { type: "capability", action: "enable", agent_id: agentId, capability, actor } }, requestId);
    return true;
  }

  if (req.method === "POST" && req.url?.startsWith("/admin/keys/") && req.url.endsWith("/revoke")) {
    const admin = await requireAdmin(ctx);
    if (!admin) {
      return true;
    }
    const keyId = decodeURIComponent(admin.pathname.slice("/admin/keys/".length, -"/revoke".length));
    const parsed = admin.parsed && typeof admin.parsed === "object" ? (admin.parsed as { actor?: unknown; reason?: unknown }) : {};
    const actor = typeof parsed.actor === "string" && parsed.actor.trim().length > 0 ? parsed.actor.trim() : "admin";
    const reason = typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : undefined;
    const revokedAt = new Date().toISOString();
    ctx.revokedSigningKeys.set(keyId, { revoked_at: revokedAt, revoked_by: actor, ...(reason ? { reason } : {}) });
    ctx.persistRuntimeControls();
    ctx.recordAuditEvent({
      timestamp: revokedAt,
      request_id: requestId,
      code: "admin_key_revoked",
      message: `Signing key ${keyId} revoked by ${actor}${reason ? `: ${reason}` : ""}`,
      method: req.method,
      route: admin.pathname
    });
    ctx.sendJson(res, 200, { control: { type: "key", action: "revoke", key_id: keyId, revoked_at: revokedAt, revoked_by: actor, ...(reason ? { reason } : {}) } }, requestId);
    return true;
  }

  if (req.method === "POST" && req.url?.startsWith("/admin/keys/") && req.url.endsWith("/unrevoke")) {
    const admin = await requireAdmin(ctx);
    if (!admin) {
      return true;
    }
    const keyId = decodeURIComponent(admin.pathname.slice("/admin/keys/".length, -"/unrevoke".length));
    const parsed = admin.parsed && typeof admin.parsed === "object" ? (admin.parsed as { actor?: unknown }) : {};
    const actor = typeof parsed.actor === "string" && parsed.actor.trim().length > 0 ? parsed.actor.trim() : "admin";
    ctx.revokedSigningKeys.delete(keyId);
    ctx.persistRuntimeControls();
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "admin_key_unrevoked",
      message: `Signing key ${keyId} unrevoked by ${actor}`,
      method: req.method,
      route: admin.pathname
    });
    ctx.sendJson(res, 200, { control: { type: "key", action: "unrevoke", key_id: keyId, actor } }, requestId);
    return true;
  }

  return false;
}
