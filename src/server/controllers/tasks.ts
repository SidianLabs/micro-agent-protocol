/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { parsePositiveIntOrDefault } from "../utils.js";

export interface TasksContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  app: {
    taskStore: {
      list(historyLength?: number): any[];
      listByTenant(tenantId: string, historyLength?: number): any[];
      getByTenant(
        taskId: string,
        tenantId: string,
        historyLength?: number,
      ): any;
    };
    orchestrator: {
      getTask(taskId: string): any;
      cancelTask(taskId: string, tenantId?: string): any;
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
}

function sendEtagJson(
  ctx: TasksContext,
  body: unknown,
  headers: Record<string, string>,
  requestId = ctx.requestId,
): true {
  const etag = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const ifNoneMatch = ctx.req.headers["if-none-match"];
  if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
    ctx.res.writeHead(304, { ...headers, etag });
    ctx.res.end();
    return true;
  }
  ctx.sendJson(
    ctx.res,
    200,
    body,
    requestId,
    { ok: true },
    { ...headers, etag },
  );
  return true;
}

export async function handleListTasks(ctx: TasksContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";
  const requestUrl = new URL(requestUrlString, "http://localhost");

  if (requestUrl.pathname !== "/tasks") return false;

  const tenantId = requestUrl.searchParams.get("tenant_id");
  const cursor = requestUrl.searchParams.get("cursor");
  const historyLengthRaw = requestUrl.searchParams.get("history_length");
  const historyLength =
    historyLengthRaw !== null
      ? parsePositiveIntOrDefault(historyLengthRaw, 0)
      : undefined;
  const limit = Math.max(
    1,
    Math.min(
      500,
      parsePositiveIntOrDefault(requestUrl.searchParams.get("limit"), 100),
    ),
  );
  const allTasks = tenantId
    ? ctx.app.taskStore.listByTenant(tenantId, historyLength)
    : ctx.app.taskStore.list(historyLength);
  const orderId = requestUrl.searchParams.get("order_id");
  const contextId = requestUrl.searchParams.get("context_id");
  const filteredTasks = (() => {
    let tasks = allTasks;
    if (orderId) {
      tasks = tasks.filter((task) => task.order_id === orderId);
    }
    if (contextId) {
      tasks = tasks.filter((task) => task.context_id === contextId);
    }
    return tasks;
  })();
  const startIndex = cursor
    ? Math.max(
        0,
        filteredTasks.findIndex((task) => task.task_id === cursor) + 1,
      )
    : 0;
  const tasks = filteredTasks.slice(startIndex, startIndex + limit);
  const nextCursorIndex = startIndex + limit;
  const nextCursor =
    nextCursorIndex < filteredTasks.length
      ? (filteredTasks[nextCursorIndex - 1]?.task_id ?? null)
      : null;
  return sendEtagJson(
    ctx,
    {
      tasks,
      pagination: {
        limit,
        next_cursor: nextCursor,
      },
    },
    { "cache-control": "no-cache" },
  );
}

export async function handleGetTask(ctx: TasksContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";

  // Only match /tasks/:id (not /tasks/:id/stream, not /tasks/:id/cancel)
  if (!requestUrlString.match(/^\/tasks\/[^/]+$/)) return false;

  const requestUrl = new URL(requestUrlString, "http://localhost");
  const pathParts = requestUrl.pathname.split("/");
  const taskId = decodeURIComponent(pathParts[2]);
  const tenantId = requestUrl.searchParams.get("tenant_id");
  const historyLengthRaw = requestUrl.searchParams.get("history_length");
  const historyLength =
    historyLengthRaw !== null
      ? parsePositiveIntOrDefault(historyLengthRaw, 0)
      : undefined;
  const task = tenantId
    ? ctx.app.taskStore.getByTenant(taskId, tenantId, historyLength)
    : ctx.app.orchestrator.getTask(taskId);

  if (!task) {
    ctx.sendError(res, 404, requestId, {
      code: "task_not_found",
      message: `Task not found: ${taskId}`,
      retryable: false,
    });
    return true;
  }
  ctx.sendJson(res, 200, { task }, requestId);
  return true;
}

export async function handleStreamTask(ctx: TasksContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";

  if (!requestUrlString.match(/^\/tasks\/[^/]+\/stream$/)) return false;

  const requestUrl = new URL(requestUrlString, "http://localhost");
  const pathParts = requestUrl.pathname.split("/");
  const taskId = decodeURIComponent(pathParts[2]);
  const tenantId = requestUrl.searchParams.get("tenant_id");
  const cursor = requestUrl.searchParams.get("cursor");

  const task = tenantId
    ? ctx.app.taskStore.getByTenant(taskId, tenantId)
    : ctx.app.orchestrator.getTask(taskId);
  if (!task) {
    ctx.sendError(res, 404, requestId, {
      code: "task_not_found",
      message: `Task not found: ${taskId}`,
      retryable: false,
    });
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Map-Request-Id": requestId,
  });

  const sendEvent = (eventType: string, data: unknown) => {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const taskState = {
    task_id: task.task_id,
    status: task.status,
    capability: task.capability,
    target_agent: task.target_agent,
    updated_at: task.updated_at,
  };

  sendEvent("status", { ...taskState, event: "status" });

  if (task.status === "completed" && task.result) {
    sendEvent("result", { task_id: task.task_id, result: task.result });
  }

  let lastStatus = task.status;
  let lastUpdatedAt = task.updated_at;

  const heartbeatInterval = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  const checkInterval = setInterval(() => {
    const currentTask = tenantId
      ? ctx.app.taskStore.getByTenant(taskId, tenantId)
      : ctx.app.orchestrator.getTask(taskId);
    if (!currentTask) {
      clearInterval(heartbeatInterval);
      clearInterval(checkInterval);
      sendEvent("error", {
        code: "task_not_found",
        message: "Task no longer exists",
      });
      res.end();
      return;
    }

    if (
      currentTask.status !== lastStatus ||
      currentTask.updated_at !== lastUpdatedAt
    ) {
      const updatedState = {
        task_id: currentTask.task_id,
        status: currentTask.status,
        capability: currentTask.capability,
        target_agent: currentTask.target_agent,
        updated_at: currentTask.updated_at,
      };
      sendEvent("status", { ...updatedState, event: "status" });
      lastStatus = currentTask.status;
      lastUpdatedAt = currentTask.updated_at;

      if (currentTask.status === "completed" && currentTask.result) {
        sendEvent("result", {
          task_id: currentTask.task_id,
          result: currentTask.result,
        });
        clearInterval(heartbeatInterval);
        clearInterval(checkInterval);
        res.end();
        return;
      }
    }
  }, 1000);

  req.on("close", () => {
    clearInterval(heartbeatInterval);
    clearInterval(checkInterval);
  });

  return true;
}

export async function handleCancelTask(ctx: TasksContext): Promise<boolean> {
  const { req, res, requestId } = ctx;

  if (
    req.method !== "POST" ||
    !req.url?.startsWith("/tasks/") ||
    !req.url?.endsWith("/cancel")
  ) {
    return false;
  }

  const taskId = req.url.slice(
    "/tasks/".length,
    req.url.length - "/cancel".length,
  );
  if (!taskId || taskId.includes("/")) {
    ctx.sendError(res, 400, requestId, {
      code: "invalid_request",
      message: "Invalid task ID in cancel path.",
      retryable: false,
    });
    return true;
  }

  const tenantId =
    typeof req.headers["x-map-tenant-id"] === "string"
      ? req.headers["x-map-tenant-id"]
      : undefined;

  try {
    const result = ctx.app.orchestrator.cancelTask(taskId, tenantId);
    ctx.recordAuditEvent({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      code: "task_cancelled",
      message: `Task ${taskId} was cancelled.`,
      method: req.method,
      route: `/tasks/${taskId}/cancel`,
      tenant_id: tenantId,
      target_agent: result.result.structured_output?.target_agent as
        | string
        | undefined,
    });
    ctx.sendJson(res, 200, result, requestId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error cancelling task.";
    if (message.includes("Task not found")) {
      ctx.sendError(res, 404, requestId, {
        code: "task_not_found",
        message,
        retryable: false,
      });
      return true;
    }
    ctx.sendError(res, 409, requestId, {
      code: "invalid_request",
      message,
      retryable: false,
    });
  }
  return true;
}
