/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface AgentsContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  app: {
    registry: {
      list(): any[];
      findByCapability(capability: string): any[];
      findByDomain(domain: string): any[];
      get(agentId: string): any;
    };
  };
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
}

export async function handleListAgents(ctx: AgentsContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";

  // Handle /agents with optional query params
  if (
    req.method !== "GET" ||
    !requestUrlString.startsWith("/agents")
  ) {
    return false;
  }

  const requestUrl = new URL(requestUrlString, "http://localhost");

  // /agents/:id/resources is handled separately
  if (requestUrl.pathname.match(/^\/agents\/[^/]+\/resources$/)) {
    return false; // handled by handleGetAgentResources
  }

  // /agents/:id is handled by handleGetAgent
  if (requestUrl.pathname.match(/^\/agents\/[^/]+$/)) {
    return false;
  }

  // /agents or /agents?capability=... or /agents?domain=...
  if (
    requestUrl.pathname === "/agents" ||
    requestUrl.pathname.startsWith("/agents?")
  ) {
    const capability = requestUrl.searchParams.get("capability");
    const domain = requestUrl.searchParams.get("domain");
    const agents = capability
      ? ctx.app.registry.findByCapability(capability)
      : domain
        ? ctx.app.registry.findByDomain(domain)
        : ctx.app.registry.list();
    ctx.sendJson(res, 200, { agents }, requestId);
    return true;
  }

  return false;
}

export async function handleGetAgent(ctx: AgentsContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";

  if (
    req.method !== "GET" ||
    !requestUrlString.match(/^\/agents\/[^/]+$/)
  ) {
    return false;
  }

  const requestUrl = new URL(requestUrlString, "http://localhost");
  const pathParts = requestUrl.pathname.split("/");
  const agentId = decodeURIComponent(pathParts[2]);
  const agent = ctx.app.registry.get(agentId);

  if (!agent) {
    ctx.sendError(res, 404, requestId, {
      code: "agent_not_found",
      message: `Agent not found: ${agentId}`,
      retryable: false,
    });
    return true;
  }
  ctx.sendJson(res, 200, { agent }, requestId);
  return true;
}

export async function handleGetAgentResources(
  ctx: AgentsContext,
): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";

  if (
    req.method !== "GET" ||
    !requestUrlString.match(/^\/agents\/[^/]+\/resources(\?.*)?$/)
  ) {
    return false;
  }

  const requestUrl = new URL(requestUrlString, "http://localhost");
  const pathParts = requestUrl.pathname.split("/");
  const agentId = decodeURIComponent(pathParts[2]);
  const agent = ctx.app.registry.get(agentId);

  if (!agent) {
    ctx.sendError(res, 404, requestId, {
      code: "agent_not_found",
      message: `Agent not found: ${agentId}`,
      retryable: false,
    });
    return true;
  }

  ctx.sendJson(
    res,
    200,
    {
      agent_id: agent.agent_id,
      resources: [
        {
          name: "input_schema",
          uri: agent.input_schema_ref,
          mime_type: "application/schema+json",
        },
        {
          name: "output_schema",
          uri: agent.output_schema_ref,
          mime_type: "application/schema+json",
        },
      ],
    },
    requestId,
  );
  return true;
}
