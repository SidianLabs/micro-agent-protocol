/**
 * MAP Protocol - Observability Module
 *
 * Logging, metrics, tracing, and health checks
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export from tracer module
export {
  OpenTelemetryTracer,
  type Span,
  type SpanKind,
  type SpanStatus,
  type SpanExporter,
  type TracerOptions,
  InMemorySpanExporter,
  CompositeSpanProcessor,
} from './tracer.js';

// Re-export from metrics module
export {
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
} from './metrics.js';

// Re-export from health-check module
export {
  HealthCheckAggregator,
  HealthCheckBuilder,
  HTTPHealthCheck,
  WebSocketHealthCheck,
  TCPHealthCheck,
  FunctionalHealthCheck,
  type HealthCheck,
  type HealthCheckResult,
} from './health-check.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  taskId?: string;
  agentId?: string;
  serviceName?: string;
}

export interface Metric {
  name: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
  timestamp: string;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  tags: Record<string, string>;
  logs: Array<{ timestamp: number; name: string; value: unknown }>;
}

export interface ObserverOptions {
  logLevel?: LogLevel;
  enableMetrics?: boolean;
  enableTracing?: boolean;
  serviceName?: string;
}

export class MAPLogger {
  private readonly serviceName: string;
  private readonly minLevel: LogLevel;
  private logs: LogEntry[] = [];
  private readonly maxLogs: number = 10000;

  constructor(serviceName: string, minLevel: LogLevel = LogLevel.INFO) {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      serviceName: this.serviceName,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (typeof console !== 'undefined') {
      const levelName = LogLevel[level];
      const prefix = `[${entry.timestamp}] [${levelName}] [${this.serviceName}]`;
      if (level >= LogLevel.ERROR) {
        console.error(prefix, message, context ?? '');
      } else if (level >= LogLevel.WARN) {
        console.warn(prefix, message, context ?? '');
      } else {
        console.log(prefix, message, context ?? '');
      }
    }
  }

  getLogs(filter?: { level?: LogLevel; taskId?: string }): LogEntry[] {
    let result = this.logs;
    if (filter?.level !== undefined) {
      result = result.filter(l => l.level === filter.level);
    }
    if (filter?.taskId) {
      result = result.filter(l => l.taskId === filter.taskId);
    }
    return result;
  }

  clear(): void {
    this.logs = [];
  }
}

export class MetricsCollector {
  private metrics: Map<string, Metric[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  increment(name: string, value: number = 1, tags: Record<string, string> = {}): void {
    const key = this.makeKey(name, tags);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);
    this.recordMetric(name, current + value, 'count', tags);
  }

  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    const key = this.makeKey(name, tags);
    this.gauges.set(key, value);
    this.recordMetric(name, value, 'gauge', tags);
  }

  histogram(name: string, value: number, tags: Record<string, string> = {}): void {
    const key = this.makeKey(name, tags);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
    this.recordMetric(name, value, 'histogram', tags);
  }

  getCounter(name: string, tags: Record<string, string> = {}): number {
    const key = this.makeKey(name, tags);
    return this.counters.get(key) ?? 0;
  }

  getGauge(name: string, tags: Record<string, string> = {}): number {
    const key = this.makeKey(name, tags);
    return this.gauges.get(key) ?? 0;
  }

  getHistogramStats(name: string, tags: Record<string, string> = {}): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.makeKey(name, tags);
    const values = this.histograms.get(key);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  getAllMetrics(): Metric[] {
    const result: Metric[] = [];
    for (const [, metrics] of this.metrics) {
      result.push(...metrics);
    }
    return result;
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.metrics.clear();
  }

  private recordMetric(name: string, value: number, unit: string, tags: Record<string, string>): void {
    const key = `${name}:${JSON.stringify(tags)}`;
    const metric: Metric = {
      name,
      value,
      unit,
      tags,
      timestamp: new Date().toISOString(),
    };
    const existing = this.metrics.get(key) ?? [];
    existing.push(metric);
    if (existing.length > 1000) existing.shift();
    this.metrics.set(key, existing);
  }

  private makeKey(name: string, tags: Record<string, string>): string {
    return `${name}:${JSON.stringify(tags)}`;
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Simple in-memory tracer (legacy, prefer OpenTelemetryTracer from tracer.ts)
 */
export class Tracer {
  private spans: Map<string, TraceSpan> = new Map();

  startSpan(operationName: string, tags: Record<string, string> = {}): TraceSpan {
    const traceId = this.generateId();
    const spanId = this.generateId();
    const span: TraceSpan = {
      traceId,
      spanId,
      operationName,
      startTime: Date.now(),
      tags,
      logs: [],
    };
    this.spans.set(spanId, span);
    return span;
  }

  endSpan(spanId: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.endTime = Date.now();
    }
  }

  addSpanTag(spanId: string, key: string, value: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.tags[key] = value;
    }
  }

  addSpanLog(spanId: string, name: string, value: unknown): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.logs.push({ timestamp: Date.now(), name, value });
    }
  }

  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }

  getAllSpans(): TraceSpan[] {
    return Array.from(this.spans.values());
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

export class ObservabilityManager {
  readonly logger: MAPLogger;
  readonly metrics: MetricsCollector;
  readonly tracer: Tracer;

  constructor(options: ObserverOptions = {}) {
    this.logger = new MAPLogger(
      options.serviceName ?? 'map-protocol',
      options.logLevel ?? LogLevel.INFO
    );
    this.metrics = new MetricsCollector();
    this.tracer = new Tracer();
  }

  recordTaskDispatch(taskId: string, capability: string, riskClass: string): void {
    this.metrics.increment('map.task.dispatched', 1, { capability, risk_class: riskClass });
    this.logger.info('Task dispatched', { taskId, capability, riskClass });
  }

  recordTaskComplete(taskId: string, durationMs: number, status: string): void {
    this.metrics.increment('map.task.completed', 1, { status });
    this.metrics.histogram('map.task.duration', durationMs, { status });
    this.logger.info('Task completed', { taskId, durationMs, status });
  }

  recordTaskFailed(taskId: string, error: string): void {
    this.metrics.increment('map.task.failed', 1, { error_type: error });
    this.logger.error('Task failed', { taskId, error });
  }

  recordPolicyCheck(taskId: string, policy: string, result: 'pass' | 'fail' | 'skip'): void {
    this.metrics.increment('map.policy.check', 1, { policy, result });
    this.logger.debug('Policy check', { taskId, policy, result });
  }

  recordAgentInvocation(agentId: string, capability: string, durationMs: number): void {
    this.metrics.increment('map.agent.invoked', 1, { agent_id: agentId, capability });
    this.metrics.histogram('map.agent.duration', durationMs, { agent_id: agentId });
  }
}
