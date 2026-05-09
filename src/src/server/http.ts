import type { IncomingMessage, ServerResponse } from "node:http";
import type { JsonBodyReadResult } from "./utils.js";

export function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
  requestId: string,
  recordRequest: (ok: boolean, errorCode?: string, targetAgent?: string) => void,
  tracking: { ok: boolean; errorCode?: string; targetAgent?: string } = { ok: true },
  extraHeaders?: Record<string, string>
): void {
  recordRequest(tracking.ok, tracking.errorCode, tracking.targetAgent);
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? { request_id: requestId, ...(body as Record<string, unknown>) }
      : { request_id: requestId, data: body };
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...(extraHeaders ?? {})
  });
  res.end(JSON.stringify(payload, null, 2));
}

export function sendError(
  res: ServerResponse,
  statusCode: number,
  requestId: string,
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  },
  recordRequest: (ok: boolean, errorCode?: string, targetAgent?: string) => void,
  targetAgent?: string
): void {
  sendJson(
    res,
    statusCode,
    { error },
    requestId,
    recordRequest,
    { ok: false, errorCode: error.code, targetAgent }
  );
}

export async function readJsonBody(req: IncomingMessage): Promise<JsonBodyReadResult> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return { parsed: {}, raw: "" };
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return {
    parsed: JSON.parse(raw),
    raw
  };
}
