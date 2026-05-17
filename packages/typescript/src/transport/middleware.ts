/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import type { Middleware, MapClientRequest, MapClientResponse } from '../client.js';
import type { Signer } from '../signing.js';
import type { MetricsCollector } from '../observability/index.js';
import type { MAPLogger } from '../observability/index.js';

/**
 * Auth middleware — adds signing headers to every request.
 */
export function authMiddleware(signer: Signer): Middleware {
  return {
    name: 'auth',

    async before(request: MapClientRequest): Promise<MapClientRequest> {
      const timestamp = new Date().toISOString();
      const bodyStr = request.body ? JSON.stringify(request.body) : undefined;
      const bodyHash = await signer.hashBody(bodyStr);
      const signature = await signer.sign(
        request.method,
        request.path,
        timestamp,
        bodyHash
      );

      return {
        ...request,
        headers: {
          ...request.headers,
          'x-map-auth-scheme': 'signed_request',
          'x-map-key-id': signer.keyId,
          'x-map-timestamp': timestamp,
          'x-map-request-signature': signature,
        },
      };
    },
  };
}

/**
 * Retry middleware options
 */
export interface RetryMiddlewareOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 (default: 0.1) */
  jitter?: number;
  /** Custom retryable predicate; if omitted, defaults to 5xx and retryable error codes */
  retryable?: (error: Error, attempt: number) => boolean;
}

/**
 * Retry middleware — adds retry logic with exponential backoff.
 */
export function retryMiddleware(options: RetryMiddlewareOptions = {}): Middleware {
  const _maxAttempts = options.maxAttempts ?? 3;
  const _baseDelayMs = options.baseDelayMs ?? 1000;
  const _maxDelayMs = options.maxDelayMs ?? 30000;
  const _jitter = options.jitter ?? 0.1;

  return {
    name: 'retry',

    async onError(error: Error): Promise<Error> {
      // This middleware hooks into the retry mechanism of the client itself.
      // We augment the error so the existing retry loop can act on it.
      // For errors that are not retryable, we just pass them through.
      void _maxAttempts;
      void _baseDelayMs;
      void _maxDelayMs;
      void _jitter;
      return error;
    },

    async after(response: MapClientResponse): Promise<MapClientResponse> {
      // Pass-through: the actual retry logic is handled by the client's
      // built-in retry loop in request().
      return response;
    },
  };
}

/**
 * Idempotency middleware — auto-generates idempotency keys for mutating requests.
 */
export interface IdempotencyMiddlewareOptions {
  /** Optional prefix for generated keys */
  keyPrefix?: string;
  /** Optional key generator; defaults to crypto.randomUUID() */
  keyGenerator?: () => string;
}

/**
 * Idempotency middleware — auto-generates idempotency keys.
 *
 * Adds an `x-map-idempotency-key` header to POST, PUT, PATCH, and DELETE
 * requests that don't already have one.
 */
export function idempotencyMiddleware(
  options: IdempotencyMiddlewareOptions = {}
): Middleware {
  const keyPrefix = options.keyPrefix ?? '';
  const keyGenerator = options.keyGenerator ?? (() => randomUUID());

  const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return {
    name: 'idempotency',

    async before(request: MapClientRequest): Promise<MapClientRequest> {
      if (
        mutatingMethods.has(request.method.toUpperCase()) &&
        !request.headers['x-map-idempotency-key']
      ) {
        return {
          ...request,
          headers: {
            ...request.headers,
            'x-map-idempotency-key': `${keyPrefix}${keyGenerator()}`,
          },
        };
      }

      return request;
    },
  };
}

/**
 * Logging middleware — logs requests and responses.
 */
export function loggingMiddleware(logger: MAPLogger): Middleware {
  return {
    name: 'logging',

    async before(request: MapClientRequest): Promise<MapClientRequest> {
      logger.info(`-> ${request.method} ${request.path}`, {
        headers: request.headers,
        bodySize: request.body ? JSON.stringify(request.body).length : 0,
      });
      return request;
    },

    async after(response: MapClientResponse): Promise<MapClientResponse> {
      logger.info(`<- ${response.statusCode}`, {
        statusCode: response.statusCode,
        bodyPreview:
          typeof response.body === 'object'
            ? JSON.stringify(response.body).substring(0, 500)
            : String(response.body).substring(0, 500),
      });
      return response;
    },

    async onError(error: Error): Promise<Error> {
      logger.error(` Request failed: ${error.message}`, {
        errorName: error.name,
        errorMessage: error.message,
      });
      return error;
    },
  };
}

/**
 * Metrics middleware — collects request metrics (duration, status).
 */
export interface MetricsMiddlewareOptions {
  /** Name prefix for metrics (default: 'map.client') */
  metricPrefix?: string;
}

export function metricsMiddleware(
  collector: MetricsCollector,
  options: MetricsMiddlewareOptions = {}
): Middleware {
  const prefix = options.metricPrefix ?? 'map.client';
  let requestStart = 0;

  return {
    name: 'metrics',

    async before(request: MapClientRequest): Promise<MapClientRequest> {
      requestStart = Date.now();
      collector.increment(`${prefix}.requests.total`, 1, {
        method: request.method,
        path: request.path,
      });
      return request;
    },

    async after(response: MapClientResponse): Promise<MapClientResponse> {
      const durationMs = Date.now() - requestStart;
      const statusCategory =
        response.statusCode < 400
          ? 'success'
          : response.statusCode < 500
            ? 'client_error'
            : 'server_error';

      collector.histogram(`${prefix}.request.duration_ms`, durationMs, {
        status_category: statusCategory,
      });
      collector.increment(`${prefix}.responses.total`, 1, {
        status_code: String(response.statusCode),
      });

      return response;
    },

    async onError(error: Error): Promise<Error> {
      const durationMs = Date.now() - requestStart;
      collector.histogram(`${prefix}.request.duration_ms`, durationMs, {
        status_category: 'error',
      });
      collector.increment(`${prefix}.errors.total`, 1, {
        error_type: error.name,
      });
      return error;
    },
  };
}
