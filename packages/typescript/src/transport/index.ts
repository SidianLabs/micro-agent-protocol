/**
 * MAP Protocol - Transport Module
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  WebSocketTransport,
  type WebSocketOptions,
  type TaskStatusUpdate,
  type BatchDispatchRequest,
  type BatchDispatchResult,
  type BatchDispatchError,
  createBatchDispatchResult,
} from './websocket.js';

export {
  authMiddleware,
  retryMiddleware,
  idempotencyMiddleware,
  loggingMiddleware,
  metricsMiddleware,
  type RetryMiddlewareOptions,
  type IdempotencyMiddlewareOptions,
  type MetricsMiddlewareOptions,
} from './middleware.js';
