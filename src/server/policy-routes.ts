/**
 * Policy API routes.
 *
 * GET  /policy  — Returns the current active policy document
 * POST /policy  — Hot-swaps the active policy document at runtime
 *
 * Policy is the single source of truth for all execution decisions.
 * It is data, not code. It can be changed without restarting the server.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { PolicyDocument } from "../core/types.js";

interface PolicyRouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  app: {
    orchestrator: {
      getPolicy(): PolicyDocument;
      setPolicy(policy: PolicyDocument): void;
    };
  };
  readJsonBody(req: IncomingMessage): Promise<{ raw: string; parsed: unknown }>;
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
  /** Optional: path to persist policy to disk on update */
  policyFilePath?: string;
}

function validatePolicyDocument(parsed: unknown): {
  valid: boolean;
  policy?: PolicyDocument;
  error?: string;
} {
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Policy must be a JSON object." };
  }

  const doc = parsed as Record<string, unknown>;

  if (doc.version !== "1.0") {
    return {
      valid: false,
      error: `Invalid policy version: "${doc.version}". Must be "1.0".`,
    };
  }

  if (!Array.isArray(doc.rules)) {
    return { valid: false, error: 'Policy must have a "rules" array.' };
  }

  for (let i = 0; i < doc.rules.length; i++) {
    const rule = doc.rules[i];
    if (!rule || typeof rule !== "object") {
      return { valid: false, error: `Rule at index ${i} must be an object.` };
    }
    if (typeof rule.id !== "string" || rule.id.trim().length === 0) {
      return {
        valid: false,
        error: `Rule at index ${i} must have a non-empty "id" string.`,
      };
    }
    if (
      typeof rule.capability !== "string" ||
      rule.capability.trim().length === 0
    ) {
      return {
        valid: false,
        error: `Rule "${rule.id}" must have a non-empty "capability" string.`,
      };
    }
    if (!rule.condition || typeof rule.condition !== "object") {
      return {
        valid: false,
        error: `Rule "${rule.id}" must have a "condition" object.`,
      };
    }
    if (!["allow", "deny", "require_approval"].includes(rule.action)) {
      return {
        valid: false,
        error: `Rule "${rule.id}" has invalid action "${rule.action}". Must be "allow", "deny", or "require_approval".`,
      };
    }
  }

  return { valid: true, policy: doc as unknown as PolicyDocument };
}

export async function handlePolicyRoutes(
  ctx: PolicyRouteContext,
): Promise<boolean> {
  const { req, res, requestId } = ctx;

  // GET /policy — return current policy
  if (req.method === "GET" && req.url === "/policy") {
    const policy = ctx.app.orchestrator.getPolicy();
    ctx.sendJson(
      res,
      200,
      {
        policy,
        metadata: {
          rules_count: policy.rules.length,
          capabilities_covered: [
            ...new Set(policy.rules.map((r) => r.capability)),
          ],
        },
      },
      requestId,
    );
    return true;
  }

  // POST /policy — hot-swap policy
  if (req.method === "POST" && req.url === "/policy") {
    const body = await ctx.readJsonBody(req);
    const validation = validatePolicyDocument(body.parsed);

    if (!validation.valid || !validation.policy) {
      ctx.sendError(res, 400, requestId, {
        code: "invalid_policy",
        message: validation.error ?? "Invalid policy document.",
        retryable: false,
        details: { category: "validation" },
      });
      return true;
    }

    const previousPolicy = ctx.app.orchestrator.getPolicy();
    ctx.app.orchestrator.setPolicy(validation.policy);

    // Persist to disk if configured
    if (ctx.policyFilePath) {
      try {
        const { writeFileSync, mkdirSync } = await import("node:fs");
        const { dirname } = await import("node:path");
        mkdirSync(dirname(ctx.policyFilePath), { recursive: true });
        writeFileSync(
          ctx.policyFilePath,
          JSON.stringify(validation.policy, null, 2),
          "utf8",
        );
      } catch (err) {
        // Non-fatal: policy is active in memory even if disk write fails
        console.error("[MAP] Failed to persist policy to disk:", err);
      }
    }

    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "policy_updated",
      message: `Policy updated: ${previousPolicy.rules.length} rules → ${validation.policy.rules.length} rules`,
      method: req.method!,
      route: "/policy",
    });

    ctx.sendJson(
      res,
      200,
      {
        ok: true,
        policy: validation.policy,
        metadata: {
          rules_count: validation.policy.rules.length,
          capabilities_covered: [
            ...new Set(validation.policy.rules.map((r) => r.capability)),
          ],
          previous_rules_count: previousPolicy.rules.length,
        },
      },
      requestId,
    );
    return true;
  }

  return false;
}
