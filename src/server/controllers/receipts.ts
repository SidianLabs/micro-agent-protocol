/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { parsePositiveIntOrDefault } from "../utils.js";

export interface ReceiptsContext {
  req: IncomingMessage;
  res: ServerResponse;
  requestId: string;
  app: {
    receiptStore: {
      list(tenantId?: string): any[];
      get(receiptId: string, tenantId?: string): any;
      verifyReceiptIntegrity(): {
        valid: boolean;
        total: number;
        errors: string[];
      };
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

function sendEtagJson(
  ctx: ReceiptsContext,
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

export async function handleListReceipts(ctx: ReceiptsContext): Promise<boolean> {
  const { req } = ctx;
  const requestUrlString = req.url ?? "/";

  if (req.method !== "GET" || !requestUrlString.startsWith("/receipts")) {
    return false;
  }

  const requestUrl = new URL(requestUrlString, "http://localhost");

  // /receipts/verify is handled separately
  if (requestUrl.pathname === "/receipts/verify") {
    return false;
  }

  // /receipts/:id is handled by handleGetReceipt
  if (requestUrl.pathname.match(/^\/receipts\/[^/]+$/)) {
    return false;
  }

  if (requestUrl.pathname !== "/receipts") {
    return false;
  }

  const tenantId = requestUrl.searchParams.get("tenant_id");
  const cursor = requestUrl.searchParams.get("cursor");
  const limit = Math.max(
    1,
    Math.min(
      500,
      parsePositiveIntOrDefault(requestUrl.searchParams.get("limit"), 100),
    ),
  );
  const allReceipts = tenantId
    ? ctx.app.receiptStore.list(tenantId)
    : ctx.app.receiptStore.list();
  const startIndex = cursor
    ? Math.max(
        0,
        allReceipts.findIndex((receipt) => receipt.receipt_id === cursor) + 1,
      )
    : 0;
  const receipts = allReceipts.slice(startIndex, startIndex + limit);
  const nextCursorIndex = startIndex + limit;
  const nextCursor =
    nextCursorIndex < allReceipts.length
      ? (allReceipts[nextCursorIndex - 1]?.receipt_id ?? null)
      : null;
  return sendEtagJson(
    ctx,
    {
      receipts,
      pagination: {
        limit,
        next_cursor: nextCursor,
      },
    },
    { "cache-control": "no-cache" },
  );
}

export async function handleGetReceipt(ctx: ReceiptsContext): Promise<boolean> {
  const { req, res, requestId } = ctx;
  const requestUrlString = req.url ?? "/";

  if (req.method !== "GET" || !requestUrlString.startsWith("/receipts/")) {
    return false;
  }

  const requestUrl = new URL(requestUrlString, "http://localhost");

  // Skip /receipts/verify
  if (requestUrl.pathname === "/receipts/verify") {
    return false;
  }

  // Only match /receipts/:id
  if (!requestUrl.pathname.match(/^\/receipts\/[^/]+$/)) {
    return false;
  }

  const receiptId = decodeURIComponent(
    requestUrl.pathname.slice("/receipts/".length),
  );
  const tenantId = requestUrl.searchParams.get("tenant_id");
  const receipt = tenantId
    ? ctx.app.receiptStore.get(receiptId, tenantId)
    : ctx.app.receiptStore.get(receiptId);

  if (!receipt) {
    ctx.sendError(res, 404, requestId, {
      code: "receipt_not_found",
      message: `Receipt not found: ${receiptId}`,
      retryable: false,
    });
    return true;
  }
  ctx.sendJson(res, 200, { receipt }, requestId);
  return true;
}

export async function handleVerifyReceipts(
  ctx: ReceiptsContext,
): Promise<boolean> {
  const { req } = ctx;
  const requestUrlString = req.url ?? "/";

  if (
    req.method !== "GET" ||
    new URL(requestUrlString, "http://localhost").pathname !==
      "/receipts/verify"
  ) {
    return false;
  }

  const result = ctx.app.receiptStore.verifyReceiptIntegrity();
  return sendEtagJson(ctx, result, { "cache-control": "no-cache" });
}
