/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Span status
 */
export type SpanStatus = 'ok' | 'error' | 'uninstrumented';

/**
 * Span kind for distributed tracing
 */
export type SpanKind = 'client' | 'server' | 'producer' | 'consumer' | 'internal';

/**
 * Trace span interface
 */
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  statusMessage?: string;
  tags: Record<string, string | number | boolean>;
  logs: Array<{
    timestamp: number;
    name: string;
    value: string | number | boolean | Record<string, unknown>;
  }>;
  serviceName: string;
}

/**
 * Tracer options
 */
export interface TracerOptions {
  serviceName: string;
  exporter?: SpanExporter;
  sampleRate?: number;
}

/**
 * Span exporter interface
 */
export interface SpanExporter {
  export(spans: Span[]): Promise<void>;
}

/**
 * In-memory span storage for testing
 */
export class InMemorySpanExporter implements SpanExporter {
  private spans: Span[] = [];

  async export(spans: Span[]): Promise<void> {
    this.spans.push(...spans);
  }

  getSpans(): Span[] {
    return this.spans;
  }

  reset(): void {
    this.spans = [];
  }
}

/**
 * OpenTelemetry-compatible tracer implementation
 */
export class OpenTelemetryTracer {
  private readonly serviceName: string;
  private readonly exporter?: SpanExporter;
  private readonly sampleRate: number;
  private activeSpans: Map<string, Span> = new Map();

  constructor(options: TracerOptions) {
    this.serviceName = options.serviceName;
    this.exporter = options.exporter;
    this.sampleRate = options.sampleRate ?? 1.0;
  }

  /**
   * Start a new span
   */
  startSpan(
    operationName: string,
    options?: {
      kind?: SpanKind;
      parentSpanId?: string;
      tags?: Record<string, string | number | boolean>;
    }
  ): Span {
    const spanId = this.generateId(8);
    const traceId = this.generateId(16);
    const parentSpanId = options?.parentSpanId;

    // Check sampling
    if (this.sampleRate < 1.0 && Math.random() > this.sampleRate) {
      return this.createUninstrumentedSpan(operationName, traceId, spanId, parentSpanId, options?.kind);
    }

    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      kind: options?.kind ?? 'internal',
      startTime: Date.now(),
      status: 'ok',
      tags: options?.tags ?? {},
      logs: [],
      serviceName: this.serviceName,
    };

    this.activeSpans.set(spanId, span);
    return span;
  }

  /**
   * End a span
   */
  endSpan(span: Span, options?: { status?: SpanStatus; statusMessage?: string }): void {
    if (span.endTime !== undefined) {
      // Span already ended
      return;
    }

    span.endTime = Date.now();
    span.status = options?.status ?? 'ok';
    span.statusMessage = options?.statusMessage;

    this.activeSpans.delete(span.spanId);

    if (this.exporter) {
      this.exporter.export([span]).catch((err) => {
        console.error('Failed to export span:', err);
      });
    }
  }

  /**
   * Add a tag to a span
   */
  setSpanTag(span: Span, key: string, value: string | number | boolean): void {
    span.tags[key] = value;
  }

  /**
   * Add multiple tags to a span
   */
  setSpanTags(span: Span, tags: Record<string, string | number | boolean>): void {
    Object.assign(span.tags, tags);
  }

  /**
   * Add a log event to a span
   */
  addSpanLog(
    span: Span,
    name: string,
    value: string | number | boolean | Record<string, unknown>
  ): void {
    span.logs.push({
      timestamp: Date.now(),
      name,
      value,
    });
  }

  /**
   * Record an error on a span
   */
  recordError(span: Span, error: Error, options?: { message?: string }): void {
    span.status = 'error';
    span.statusMessage = options?.message ?? error.message;
    this.addSpanLog(span, 'error', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
  }

  /**
   * Get an active span by ID
   */
  getSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * Create a scoped tracer that automatically manages span lifecycle
   */
  startScopedSpan<T>(
    operationName: string,
    fn: (span: Span) => T,
    options?: {
      kind?: SpanKind;
      parentSpanId?: string;
      tags?: Record<string, string | number | boolean>;
    }
  ): T {
    const span = this.startSpan(operationName, options);
    try {
      const result = fn(span);
      this.endSpan(span);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        this.recordError(span, error);
      }
      this.endSpan(span, { status: 'error', statusMessage: String(error) });
      throw error;
    }
  }

  /**
   * Create an async scoped span
   */
  async startScopedSpanAsync<T>(
    operationName: string,
    fn: (span: Span) => Promise<T>,
    options?: {
      kind?: SpanKind;
      parentSpanId?: string;
      tags?: Record<string, string | number | boolean>;
    }
  ): Promise<T> {
    const span = this.startSpan(operationName, options);
    try {
      const result = await fn(span);
      this.endSpan(span);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        this.recordError(span, error);
      }
      this.endSpan(span, { status: 'error', statusMessage: String(error) });
      throw error;
    }
  }

  private createUninstrumentedSpan(
    operationName: string,
    traceId: string,
    spanId: string,
    parentSpanId: string | undefined,
    kind?: SpanKind
  ): Span {
    return {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      kind: kind ?? 'internal',
      startTime: Date.now(),
      status: 'uninstrumented',
      tags: {},
      logs: [],
      serviceName: this.serviceName,
    };
  }

  private generateId(length: number): string {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i = 0; i < length; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
}

/**
 * Composite span processor for multiple exporters
 */
export class CompositeSpanProcessor implements SpanExporter {
  constructor(private exporters: SpanExporter[]) {}

  async export(spans: Span[]): Promise<void> {
    await Promise.all(this.exporters.map((exporter) => exporter.export(spans)));
  }
}
