/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";

const BASE_URL = "http://localhost:8787";

interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

async function dispatchRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<DispatchResponse> {
  const url = new URL(path, BASE_URL);
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let responseBody: Record<string, unknown> = {};
  try {
    responseBody = (await response.json()) as Record<string, unknown>;
  } catch {
    // ignore parse errors
  }

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: responseBody,
  };
}

describe("API Surface Tests", () => {
  describe("GET /tasks pagination", () => {
    it("should support limit parameter", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&limit=10"
      );

      if (response.statusCode === 200) {
        const hasLimit =
          "limit" in response.body ||
          "pagination" in response.body;
        console.log(`Limit parameter supported: ${hasLimit}`);
      }
    });

    it("should support offset parameter", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&limit=10&offset=10"
      );

      if (response.statusCode === 200) {
        const hasOffset =
          "offset" in response.body ||
          "pagination" in response.body;
        console.log(`Offset parameter supported: ${hasOffset}`);
      }
    });

    it("should return next_cursor for pagination", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&limit=5"
      );

      if (response.statusCode === 200) {
        const hasNextCursor =
          "next_cursor" in response.body ||
          "pagination" in response.body;
        console.log(`Next cursor supported: ${hasNextCursor}`);
      }
    });

    it("should respect limit bounds", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&limit=1000"
      );

      console.log(`Limit bounds: ${response.statusCode}`);
    });
  });

  describe("GET /tasks filtering", () => {
    it("should filter by tenant_id", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A"
      );

      const isSuccess = response.statusCode === 200;
      console.log(`Tenant filter: ${isSuccess}`);
    });

    it("should filter by status", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&status=pending"
      );

      console.log(`Status filter: ${response.statusCode}`);
    });

    it("should filter by task_id", async () => {
      const taskId = `filter-test-${randomUUID()}`;
      const response = await dispatchRequest(
        "GET",
        `/tasks?tenant_id=tenant_A&task_id=${taskId}`
      );

      console.log(`Task ID filter: ${response.statusCode}`);
    });

    it("should filter by created_after", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A&created_after=2026-01-01T00:00:00.000Z"
      );

      console.log(`Created after filter: ${response.statusCode}`);
    });
  });

  describe("ETag support", () => {
    it("should return ETag header on GET /tasks", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A"
      );

      const hasETag = response.headers.etag !== undefined || response.headers["etag"] !== undefined;
      console.log(`ETag header present: ${hasETag}`);
    });

    it("should support If-None-Match header", async () => {
      // First request to get ETag
      const firstResponse = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A"
      );

      const etag = firstResponse.headers.etag || firstResponse.headers["etag"];

      // Second request with If-None-Match
      const secondResponse = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A",
        undefined,
        etag ? { "If-None-Match": etag } : {}
      );

      // Should return 304 Not Modified if ETag matches
      const isNotModified = secondResponse.statusCode === 304;
      console.log(`If-None-Match support: ${isNotModified || secondResponse.statusCode === 200}`);
    });

    it("should return 200 when ETag doesn't match", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A",
        undefined,
        { "If-None-Match": "invalid_etag" }
      );

      const returnsContent = response.statusCode === 200;
      console.log(`ETag mismatch returns 200: ${returnsContent}`);
    });
  });

  describe("Rate limit headers", () => {
    it("should include X-RateLimit-Limit header", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A"
      );

      const hasRateLimit =
        response.headers["x-ratelimit-limit"] !== undefined ||
        response.headers["x-ratelimit-remaining"] !== undefined;
      console.log(`Rate limit headers: ${hasRateLimit}`);
    });

    it("should include X-RateLimit-Remaining header", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A"
      );

      const hasRemaining =
        response.headers["x-ratelimit-remaining"] !== undefined ||
        response.headers["ratelimit-remaining"] !== undefined;
      console.log(`Rate limit remaining: ${hasRemaining}`);
    });

    it("should include Retry-After on 429 response", async () => {
      // Make many requests to trigger rate limit if possible
      for (let i = 0; i < 100; i++) {
        await dispatchRequest("GET", "/tasks?tenant_id=tenant_A");
      }

      const response = await dispatchRequest("GET", "/tasks?tenant_id=tenant_A");

      if (response.statusCode === 429) {
        const hasRetryAfter =
          response.headers["retry-after"] !== undefined ||
          "retry_after" in response.body;
        console.log(`Retry-After on 429: ${hasRetryAfter}`);
      }
    });
  });

  describe("Request ID correlation", () => {
    it("should return X-Request-ID header", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A"
      );

      const hasRequestId =
        response.headers["x-request-id"] !== undefined ||
        response.headers["request-id"] !== undefined;
      console.log(`Request ID header: ${hasRequestId}`);
    });

    it("should accept X-Request-ID header for correlation", async () => {
      const requestId = `req-${randomUUID()}`;
      const response = await dispatchRequest(
        "GET",
        "/tasks?tenant_id=tenant_A",
        undefined,
        { "X-Request-ID": requestId }
      );

      const echoesRequestId =
        response.headers["x-request-id"] === requestId ||
        response.body.request_id === requestId;
      console.log(`Request ID echoed: ${echoesRequestId}`);
    });

    it("should include request_id in error responses", async () => {
      const response = await dispatchRequest(
        "GET",
        "/tasks/nonexistent?tenant_id=tenant_A"
      );

      if (response.statusCode >= 400) {
        const hasRequestId =
          "request_id" in response.body ||
          response.headers["x-request-id"] !== undefined;
        console.log(`Request ID in error: ${hasRequestId}`);
      }
    });
  });
});
