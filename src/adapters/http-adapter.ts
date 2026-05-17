/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * HTTP Adapter
 *
 * Executes outbound HTTP requests as a MAP capability.
 *
 * Capability: "http.request"
 *
 * Input schema:
 *   url:     string  (required) — must be https:// in production
 *   method:  string  (optional, default: "GET") — GET | POST | PUT | PATCH | DELETE | HEAD
 *   headers: object  (optional) — key/value pairs
 *   body:    string  (optional) — request body (for POST/PUT/PATCH)
 *   timeout_ms: number (optional, default: 10000) — max wait time
 *
 * Policy example to control this adapter:
 *   { "id": "no-internal", "capability": "http.request",
 *     "condition": { "in": ["input.url", ["http://", "localhost"]] },
 *     "action": "deny" }
 */

import type {
  ExecutionAdapter,
  ExecutionContext,
  ExecutionResult,
  ValidationResult,
} from "../core/types.js";

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
type HttpMethod = (typeof ALLOWED_METHODS)[number];

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BODY_BYTES = 1024 * 1024; // 1MB

export interface HttpAdapterOptions {
  /**
   * If true, only https:// URLs are allowed. Default: true.
   * Set to false only in development/testing.
   */
  requireHttps?: boolean;
  /**
   * List of blocked URL prefixes (e.g. internal networks).
   * Default blocks common internal ranges.
   */
  blockedPrefixes?: string[];
  /**
   * Maximum response body size in bytes. Default: 1MB.
   */
  maxResponseBodyBytes?: number;
}

export class HttpAdapter implements ExecutionAdapter {
  readonly capability = "http.request";

  private readonly requireHttps: boolean;
  private readonly blockedPrefixes: string[];
  private readonly maxResponseBodyBytes: number;

  constructor(options: HttpAdapterOptions = {}) {
    this.requireHttps = options.requireHttps ?? true;
    this.blockedPrefixes = options.blockedPrefixes ?? [
      "http://localhost",
      "http://127.",
      "http://10.",
      "http://0.",
      "http://172.16.",
      "http://172.17.",
      "http://172.18.",
      "http://172.19.",
      "http://172.20.",
      "http://172.21.",
      "http://172.22.",
      "http://172.23.",
      "http://172.24.",
      "http://172.25.",
      "http://172.26.",
      "http://172.27.",
      "http://172.28.",
      "http://172.29.",
      "http://172.30.",
      "http://172.31.",
      "http://192.168.",
      "http://169.254.",
      "http://[::",
      "https://localhost",
      "https://127.",
      "https://[::",
      "https://0.",
    ];
    this.maxResponseBodyBytes =
      options.maxResponseBodyBytes ?? MAX_RESPONSE_BODY_BYTES;
  }

  validate(input: unknown): ValidationResult {
    if (!input || typeof input !== "object") {
      return {
        valid: false,
        errors: [{ field: "input", message: "Input must be an object." }],
      };
    }

    const inp = input as Record<string, unknown>;
    const errors: Array<{ field: string; message: string }> = [];

    // url
    if (typeof inp.url !== "string" || inp.url.trim().length === 0) {
      errors.push({ field: "url", message: "url is required and must be a non-empty string." });
    } else {
      const url = inp.url.trim();
      if (this.requireHttps && !url.startsWith("https://")) {
        errors.push({ field: "url", message: "Only https:// URLs are allowed." });
      }
      try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === "localhost" || hostname === "0.0.0.0" ||
            hostname === "[::1]" || hostname === "[::]" ||
            hostname === "127.0.0.1") {
          errors.push({ field: "url", message: "URL targets a blocked host." });
        } else {
          const blocked = this.blockedPrefixes.find((prefix) =>
            url.toLowerCase().startsWith(prefix.toLowerCase()),
          );
          if (blocked) {
            errors.push({ field: "url", message: "URL is blocked (matches blocked prefix)." });
          }
        }
      } catch {
        errors.push({ field: "url", message: "url is not a valid URL." });
      }
    }

    // method
    if (inp.method !== undefined) {
      if (typeof inp.method !== "string") {
        errors.push({ field: "method", message: "method must be a string." });
      } else if (!ALLOWED_METHODS.includes(inp.method.toUpperCase() as HttpMethod)) {
        errors.push({
          field: "method",
          message: `method must be one of: ${ALLOWED_METHODS.join(", ")}.`,
        });
      }
    }

    // headers
    if (inp.headers !== undefined) {
      if (typeof inp.headers !== "object" || Array.isArray(inp.headers)) {
        errors.push({ field: "headers", message: "headers must be a plain object." });
      } else {
        for (const [key, value] of Object.entries(inp.headers as Record<string, unknown>)) {
          if (typeof value !== "string") {
            errors.push({ field: `headers.${key}`, message: "Header values must be strings." });
          }
        }
      }
    }

    // body
    if (inp.body !== undefined && typeof inp.body !== "string") {
      errors.push({ field: "body", message: "body must be a string." });
    }

    // timeout_ms
    if (inp.timeout_ms !== undefined) {
      if (typeof inp.timeout_ms !== "number" || inp.timeout_ms <= 0) {
        errors.push({ field: "timeout_ms", message: "timeout_ms must be a positive number." });
      } else if (inp.timeout_ms > MAX_TIMEOUT_MS) {
        errors.push({
          field: "timeout_ms",
          message: `timeout_ms cannot exceed ${MAX_TIMEOUT_MS}ms.`,
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async execute(
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const url = (input.url as string).trim();
    const method = ((input.method as string | undefined) ?? "GET").toUpperCase() as HttpMethod;
    const headers = (input.headers as Record<string, string> | undefined) ?? {};
    const body = input.body as string | undefined;
    const timeoutMs = Math.min(
      typeof input.timeout_ms === "number" ? input.timeout_ms : DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "user-agent": "MAP/1.0 (http-adapter)",
          "x-map-intent-id": context.intent_id,
          ...headers,
        },
        body: body !== undefined && method !== "GET" && method !== "HEAD" ? body : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - startedAt;

      // Read response body with size limit
      const reader = response.body?.getReader();
      let responseBody = "";
      let bytesRead = 0;
      let truncated = false;

      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesRead += value.byteLength;
          if (bytesRead > this.maxResponseBodyBytes) {
            truncated = true;
            reader.cancel();
            break;
          }
          responseBody += decoder.decode(value, { stream: true });
        }
      }

      // Try to parse as JSON, fall back to raw string
      let parsedBody: unknown = responseBody;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        // Not JSON — keep as string
      }

      const output: Record<string, unknown> = {
        status: response.status,
        status_text: response.statusText,
        ok: response.ok,
        url: response.url,
        duration_ms: durationMs,
        headers: (() => {
          const h: Record<string, string> = {};
          response.headers.forEach((value, key) => { h[key] = value; });
          return h;
        })(),
        body: parsedBody,
        ...(truncated ? { truncated: true, bytes_read: bytesRead } : {}),
      };

      return {
        intent_id: context.intent_id,
        capability: this.capability,
        status: response.ok ? "ok" : "error",
        output,
        summary: `${method} ${url} → ${response.status} ${response.statusText} (${durationMs}ms)`,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const message = isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : "Unknown fetch error";

      return {
        intent_id: context.intent_id,
        capability: this.capability,
        status: "error",
        output: {
          error: message,
          timed_out: isTimeout,
          duration_ms: durationMs,
          url,
          method,
        },
        summary: `${method} ${url} → ERROR: ${message}`,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
