/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  MapAssistantClient,
  type MapClientOptions,
  type MapClientRequest,
  type MapClientResponse,
  type Middleware,
  type TaskEvent,
  type DispatchOptions,
  type WorkflowOptions,
  type WorkflowResult,
  type ListTasksOptions,
  type GetTaskOptions,
  type ListAgentsOptions,
  type BatchDispatchRequest,
  type BatchDispatchResult,
  type BatchDispatchError,
} from './client.js';

export {
  MapError,
  MapAPIError,
  MapValidationError,
  MapSigningError,
  MapTimeoutError,
  MapRetryableError,
  type APIErrorResponse,
  type ErrorCode,
  type ErrorDetails,
  type ValidationErrorDetail,
  ERROR_CODE_STATUS_MAP,
  ERROR_CODE_RETRYABLE_MAP,
  isErrorCode,
} from './errors.js';

export {
  createSigner,
  HMACSigner,
  RSASigner,
  type SignerOptions,
} from './signing.js';

export {
  HTTPSigner,
  type SignerConfig,
} from './signing-http.js';

export * from './types.js';

export {
  validateTaskEnvelope,
  validateDispatchRequest,
  validateApprovalRequest,
  validateResultPackage,
  validateExecutionReceipt,
  validateDelegationToken,
} from './validators.js';

export {
  PolicyEngine,
  PolicyEffect,
  createRiskBasedPolicy,
  evaluateTaskConstraints,
  type PolicyResult,
  type PolicyRule,
  type PolicyCondition,
  type PolicyContext,
} from './policy/index.js';

export {
  MAPLogger,
  MetricsCollector,
  Tracer,
  ObservabilityManager,
  LogLevel,
  type LogEntry,
  type Metric,
  type TraceSpan,
  type ObserverOptions,
  // OpenTelemetry tracer
  type Span,
  type SpanKind,
  type SpanStatus,
  type SpanExporter,
  type TracerOptions,
  InMemorySpanExporter,
  CompositeSpanProcessor,
  // Prometheus metrics
  PrometheusMetricsCollector,
  globalMetrics,
  type MetricType,
  type MetricValue,
  type CounterMetric,
  type GaugeMetric,
  type HistogramBucket,
  type HistogramMetric,
  type SummaryQuantile,
  type SummaryMetric,
  type MetricsCollectorOptions,
  // Health checks
  HealthCheckAggregator,
  HealthCheckBuilder,
  HTTPHealthCheck,
  WebSocketHealthCheck,
  TCPHealthCheck,
  FunctionalHealthCheck,
  type HealthCheck,
  type HealthCheckResult,
} from './observability/index.js';

export {
  InMemoryTaskStore,
  InMemoryReceiptStore,
  CompositeStore,
  type TaskStoreOptions,
  type ReceiptStoreOptions,
  type StorageResult,
} from './storage/index.js';

// Transport exports
export {
  WebSocketTransport,
  type WebSocketOptions,
  type TaskStatusUpdate,
  type BatchDispatchRequest as WsBatchDispatchRequest,
  type BatchDispatchResult as WsBatchDispatchResult,
  type BatchDispatchError as WsBatchDispatchError,
  createBatchDispatchResult,
} from './transport/index.js';
