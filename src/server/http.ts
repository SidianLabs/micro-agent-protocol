import type { IncomingMessage, ServerResponse } from "node:http";
import type { JsonBodyReadResult } from "./utils.js";

const DEFAULT_MAX_BODY_SIZE = 1_048_576; // 1 MB
const DEFAULT_BODY_READ_TIMEOUT_MS = 30_000; // 30 seconds

/** Security headers applied to every response */
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cache-control": "no-store, max-age=0",
};

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
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    ...SECURITY_HEADERS,
  };

  // Add HSTS header for HTTPS connections (skip on localhost)
  const proto = res.req?.headers?.["x-forwarded-proto"];
  const host = res.req?.headers?.host ?? "";
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const isHttps = proto === "https" || (res.socket && (res.socket as any).localPort === 443);
  if (isHttps && !isLocalhost) {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }

  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }

  res.writeHead(statusCode, headers);
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

/**
 * Sanitize parsed JSON objects to prevent prototype pollution.
 * Strips __proto__, constructor, and prototype keys recursively.
 */
function sanitizeKeys(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeKeys);
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    cleaned[key] = sanitizeKeys(value);
  }
  return cleaned;
}

/**
 * Read and parse the JSON request body with security protections:
 * - Maximum body size limit (default 1 MB)
 * - Read timeout (default 30 seconds)
 * - Prototype pollution sanitization
 */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number = DEFAULT_MAX_BODY_SIZE,
  timeoutMs: number = DEFAULT_BODY_READ_TIMEOUT_MS
): Promise<JsonBodyReadResult> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Request body read timeout exceeded.")), timeoutMs)
  );

  const readBody = async (): Promise<Buffer[]> => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += buf.length;
      if (totalSize > maxBytes) {
        throw new Error(
          `Request body exceeds maximum size of ${maxBytes} bytes.`
        );
      }
      chunks.push(buf);
    }

    return chunks;
  };

  const chunks = await Promise.race([readBody(), timeout]);

  if (chunks.length === 0) {
    return { parsed: {}, raw: "" };
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON in request body.");
  }

  // Protect against prototype pollution
  const sanitized = sanitizeKeys(parsed);

  return { parsed: sanitized, raw };
}
