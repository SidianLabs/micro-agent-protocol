/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  DispatchRequest,
  ApprovalRequest,
  InvokeResult,
  TaskRecord,
  AgentDescriptor,
  ResultPackage,
  ExecutionReceipt,
  TaskStatus,
} from './types.js';
import {
  MapError,
  MapAPIError,
  type ErrorCode,
  ERROR_CODE_RETRYABLE_MAP,
} from './errors.js';
import { HTTPSigner } from './signing-http.js';

/**
 * Client options
 */
export interface MapClientOptions {
  baseUrl: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  retryAttempts?: number;
  retryDelayMs?: number;
  retryMaxDelayMs?: number;
  retryJitter?: number;
}

/**
 * Dispatch options
 */
export interface DispatchOptions {
  idempotencyKey?: string;
}

/**
 * Workflow options for the high-level workflow() method
 */
export interface WorkflowOptions {
  /** If true, automatically approve tasks that return awaiting_approval */
  autoApprove?: boolean;
  /** If true, poll until the task reaches a terminal state */
  pollUntilComplete?: boolean;
  /** Polling interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
  /** Polling timeout in milliseconds (default: 30000) */
  pollTimeoutMs?: number;
}

/**
 * Result returned by the workflow() method
 */
export interface WorkflowResult {
  result: ResultPackage;
  receipt: ExecutionReceipt;
  /** Set when polling was used to wait for completion */
  polled?: boolean;
}

/**
 * List tasks options
 */
export interface ListTasksOptions {
  tenant_id?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Get task options
 */
export interface GetTaskOptions {
  tenant_id?: string;
}

/**
 * List agents options
 */
export interface ListAgentsOptions {
  domain?: string;
  capability?: string;
}

/**
 * Batch dispatch request
 */
export interface BatchDispatchRequest {
  requests: DispatchRequest[];
  parallel?: boolean;
}

/**
 * Error in batch dispatch
 */
export interface BatchDispatchError {
  index: number;
  error: {
    code: ErrorCode;
    message: string;
    status: number;
  };
}

/**
 * Batch dispatch result
 */
export interface BatchDispatchResult {
  results: InvokeResult[];
  errors: BatchDispatchError[];
}

/**
 * Request context passed to middleware
 */
export interface MapClientRequest {
  method: string;
  path: string;
  body?: unknown;
  headers: Record<string, string>;
}

/**
 * Response context passed to middleware
 */
export interface MapClientResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Middleware interface for the MAP client
 */
export interface Middleware {
  name: string;
  before?(request: MapClientRequest): Promise<MapClientRequest>;
  after?(response: MapClientResponse): Promise<MapClientResponse>;
  onError?(error: Error): Promise<Error>;
}

/**
 * Event types for task streaming
 */
export type TaskEvent =
  | { type: 'status'; status: TaskStatus; timestamp: string }
  | { type: 'result'; result: ResultPackage }
  | { type: 'receipt'; receipt: ExecutionReceipt }
  | { type: 'error'; error: { code: string; message: string } };

/**
 * MapAssistantClient - Main client for MAP Protocol
 */
export class MapAssistantClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly retryJitter: number;
  private signer: HTTPSigner | null = null;
  private middlewareStack: Middleware[] = [];

  constructor(options: MapClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeout = options.timeout ?? 30000;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 30000;
    this.retryJitter = options.retryJitter ?? 0.1;
  }

  /**
   * Create a client for a base URL
   */
  static forBaseUrl(baseUrl: string, options?: Partial<MapClientOptions>): MapAssistantClient {
    return new MapAssistantClient({ baseUrl, ...options });
  }

  /**
   * Configure request signing
   */
  configureSigning(keyId: string, secret: string): void {
    this.signer = new HTTPSigner(keyId, secret);
  }

  /**
   * Register a middleware on the client
   */
  use(middleware: Middleware): void {
    this.middlewareStack.push(middleware);
  }

  /**
   * Dispatch a task to a micro-agent
   */
  async dispatch(
    request: DispatchRequest,
    options?: DispatchOptions
  ): Promise<InvokeResult> {
    const response = await this.request<
      { result: ResultPackage; receipt?: ExecutionReceipt },
      DispatchRequest
    >('POST', '/dispatch', request, {
      'x-map-idempotency-key': options?.idempotencyKey,
    });

    if (!response.result) {
      throw new MapError('No result in dispatch response');
    }

    return {
      result: response.result,
      receipt: response.receipt!,
    };
  }

  /**
   * Batch dispatch multiple requests
   */
  async dispatchBatch(
    request: BatchDispatchRequest
  ): Promise<BatchDispatchResult> {
    const results: InvokeResult[] = [];
    const errors: BatchDispatchError[] = [];

    if (request.parallel) {
      // Execute all requests in parallel
      const responses = await Promise.allSettled(
        request.requests.map((req, index) =>
          this.dispatch(req).then(
            (result) => ({ index, result, error: null }),
            (error) => ({ index, result: null, error })
          )
        )
      );

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        if (response.status === 'fulfilled') {
          if (response.value.error) {
            const apiError = response.value.error as MapAPIError;
            errors.push({
              index: response.value.index,
              error: {
                code: apiError.code ?? 'internal_error',
                message: apiError.message,
                status: apiError.status ?? 500,
              },
            });
          } else {
            results.push(response.value.result!);
          }
        } else {
          const error = response.reason;
          errors.push({
            index: i,
            error: {
              code: 'internal_error',
              message: (error as Error).message,
              status: 500,
            },
          });
        }
      }
    } else {
      // Execute sequentially
      for (let i = 0; i < request.requests.length; i++) {
        const req = request.requests[i];
        try {
          const result = await this.dispatch(req);
          results.push(result);
        } catch (error) {
          if (error instanceof MapAPIError) {
            errors.push({
              index: i,
              error: {
                code: error.code ?? 'internal_error',
                message: error.message,
                status: error.status ?? 500,
              },
            });
          } else {
            errors.push({
              index: i,
              error: {
                code: 'internal_error',
                message: (error as Error).message,
                status: 500,
              },
            });
          }
        }
      }
    }

    return { results, errors };
  }

  /**
   * Approve a pending task
   */
  async approve(request: ApprovalRequest): Promise<InvokeResult> {
    const response = await this.request<
      { result: ResultPackage; receipt?: ExecutionReceipt },
      ApprovalRequest
    >('POST', '/approve', request);

    if (!response.result) {
      throw new MapError('No result in approve response');
    }

    return {
      result: response.result,
      receipt: response.receipt!,
    };
  }

  /**
   * High-level workflow that chains dispatch → poll → approve automatically.
   */
  async workflow(
    request: DispatchRequest,
    options?: WorkflowOptions,
  ): Promise<WorkflowResult> {
    // 1. Dispatch
    const dispatchResult = await this.dispatch(request);

    // 2. If awaiting_approval, auto-approve (if autoApprove is true)
    if (
      dispatchResult.result.status === "awaiting_approval" &&
      options?.autoApprove
    ) {
      const approvalRef =
        (dispatchResult.result.structured_output?.approval_reference as string) ??
        dispatchResult.result.task_id;
      const approveResult = await this.approve({
        task_id: request.envelope.task_id,
        approval_reference: approvalRef,
        capability: request.capability,
        envelope: request.envelope,
      });
      return { result: approveResult.result, receipt: approveResult.receipt };
    }

    // 3. If running (async), poll until terminal
    if (
      dispatchResult.result.status === "running" &&
      options?.pollUntilComplete
    ) {
      const pollResult = await this.pollUntilTerminal(
        request.envelope.task_id,
        options.pollIntervalMs ?? 1000,
        options.pollTimeoutMs ?? 30000,
      );
      return {
        result: pollResult.result,
        receipt: pollResult.receipt ?? dispatchResult.receipt,
        polled: true,
      };
    }

    return { result: dispatchResult.result, receipt: dispatchResult.receipt };
  }

  /**
   * Poll a task until it reaches a terminal state or times out.
   */
  async pollUntilTerminal(
    taskId: string,
    intervalMs: number = 1000,
    timeoutMs: number = 30000,
  ): Promise<{ result: ResultPackage; receipt?: ExecutionReceipt }> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const task = await this.getTask(taskId);

      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "denied" ||
        task.status === "revoked"
      ) {
        if (!task.result) {
          throw new MapError(`Task ${taskId} reached terminal state ${task.status} without a result`);
        }
        return { result: task.result, receipt: task.receipt };
      }

      if (task.status === "awaiting_approval") {
        return {
          result: task.result ?? {
            task_id: taskId,
            status: "awaiting_approval",
            structured_output: {},
            followup_required: false,
          },
          receipt: task.receipt,
        };
      }

      await this.sleep(intervalMs);
    }

    throw new MapError(
      `Polling timed out after ${timeoutMs}ms for task ${taskId}`,
    );
  }

  /**
   * Cancel a task by ID
   */
  async cancelTask(taskId: string, options?: { tenant_id?: string }): Promise<InvokeResult> {
    const query = this.buildQuery({ tenant_id: options?.tenant_id });
    const response = await this.request<
      { result: ResultPackage; receipt?: ExecutionReceipt }
    >('POST', `/tasks/${encodeURIComponent(taskId)}/cancel${query}`);

    if (!response.result) {
      throw new MapError('No result in cancel response');
    }

    return {
      result: response.result,
      receipt: response.receipt!,
    };
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string, options?: GetTaskOptions): Promise<TaskRecord> {
    const query = this.buildQuery({ tenant_id: options?.tenant_id });
    const response = await this.request<{ task: TaskRecord }>(
      'GET',
      `/tasks/${encodeURIComponent(taskId)}${query}`
    );
    return response.task;
  }

  /**
   * List tasks with optional filters
   */
  async listTasks(options?: ListTasksOptions): Promise<{
    tasks: TaskRecord[];
    pagination?: { limit: number; next_cursor: string | null };
  }> {
    const query = this.buildQuery({
      tenant_id: options?.tenant_id,
      limit: options?.limit?.toString(),
      cursor: options?.cursor,
    });
    return this.request('GET', `/tasks${query}`);
  }

  /**
   * List agents with optional filters
   */
  async listAgents(filters?: ListAgentsOptions): Promise<{ agents: AgentDescriptor[] }> {
    const query = this.buildQuery({
      domain: filters?.domain,
      capability: filters?.capability,
    });
    return this.request('GET', `/agents${query}`);
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<{ status: string }> {
    return this.request('GET', '/health');
  }

  /**
   * Get agent by ID
   */
  async getStatus(): Promise<Record<string, unknown>> {
    return this.request('GET', '/status');
  }

  /**
   * Stream task events via SSE
   *
   * Opens an SSE connection to GET /tasks/{taskId}/stream,
   * parses incoming events into typed TaskEvent objects,
   * and yields them as they arrive. Automatically reconnects
   * on disconnect.
   */
  async streamTask(taskId: string): Promise<AsyncIterable<TaskEvent>> {
    const encodedTaskId = encodeURIComponent(taskId);
    const streamUrl = `${this.baseUrl}/tasks/${encodedTaskId}/stream`;
    const client = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<TaskEvent> {
        let buffer = '';
        let abortController: AbortController | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;
        let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        async function connect(): Promise<Response> {
          abortController = new AbortController();
          const sig = abortController.signal;

          const response = await fetch(streamUrl, {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              ...client['defaultHeaders'],
            },
            signal: sig,
          });

          if (!response.ok) {
            const errorBody = await response.json().catch(() => ({})) as {
              error?: { code?: string; message?: string };
            };
            throw new MapAPIError({
              code: (errorBody?.error?.code as ErrorCode) ?? 'request_failed',
              message: errorBody?.error?.message ?? `HTTP ${response.status}`,
              status: response.status,
            });
          }

          if (!response.body) {
            throw new MapError('Response body is not readable');
          }

          return response;
        }

        function parseSSE(chunk: string): TaskEvent[] {
          const events: TaskEvent[] = [];
          buffer += chunk;

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            let eventType = '';
            let data = '';

            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                data = line.slice(6).trim();
              }
            }

            if (!data) continue;

            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              events.push(parsed as unknown as TaskEvent);
            } catch {
              // If raw JSON parsing fails, try to construct an event from the event type
              if (eventType && data) {
                try {
                  events.push({ type: eventType, ...JSON.parse(data) } as unknown as TaskEvent);
                } catch {
                  // Skip unparseable events
                }
              }
            }
          }

          return events;
        }

        async function readStream(
          response: Response,
          push: (event: TaskEvent) => void
        ): Promise<void> {
          const reader = response.body!.getReader();
          activeReader = reader;
          const decoder = new TextDecoder();

          try {
            while (!stopped) {
              const { done, value } = await reader.read();
              if (done) break;

              const text = decoder.decode(value, { stream: true });
              const events = parseSSE(text);
              for (const event of events) {
                push(event);
              }
            }
          } finally {
            activeReader = null;
            reader.releaseLock();
          }
        }

        return {
          async next(): Promise<IteratorResult<TaskEvent>> {
            if (stopped) {
              return { done: true, value: undefined };
            }

            let response: Response;
            try {
              response = await connect();
            } catch (err) {
              // If stopped during connect, return done
              if (stopped) {
                return { done: true, value: undefined };
              }
              throw err;
            }

            const pending: TaskEvent[] = [];
            let resolvePending: (() => void) | null = null;

            readStream(response, (event: TaskEvent) => {
              pending.push(event);
              if (resolvePending) {
                resolvePending();
                resolvePending = null;
              }
            }).catch(() => {
              // Stream ended, signal reconnect if not stopped
              if (!stopped && reconnectTimeout === null) {
                // Push will happen when readStream errors
              }
            });

            // Wait for the first event
            while (pending.length === 0 && !stopped) {
              await new Promise<void>((resolve) => {
                resolvePending = resolve;
                // Safety timeout to avoid hanging forever
                const safety = setTimeout(() => {
                  if (resolvePending === resolve) {
                    resolvePending = null;
                    resolve();
                  }
                }, 5000);
                const origResolve = resolve;
                resolve = () => {
                  clearTimeout(safety);
                  origResolve();
                };
              });
            }

            if (stopped && pending.length === 0) {
              return { done: true, value: undefined };
            }

            const event = pending.shift()!;
            return { done: false, value: event };
          },

          async return(): Promise<IteratorResult<TaskEvent>> {
            stopped = true;
            if (activeReader) {
              await activeReader.cancel().catch(() => undefined);
            }
            if (abortController) {
              abortController.abort();
            }
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
            }
            return { done: true, value: undefined };
          },

          async throw(e?: unknown): Promise<IteratorResult<TaskEvent>> {
            stopped = true;
            if (activeReader) {
              await activeReader.cancel().catch(() => undefined);
            }
            if (abortController) {
              abortController.abort();
            }
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
            }
            throw e;
          },
        };
      },
    };
  }

  /**
   * Make an HTTP request with retry logic and middleware support
   */
  private async request<T, B = unknown>(
    method: string,
    path: string,
    body?: B,
    additionalHeaders: Record<string, string | undefined> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Build the initial request object for middleware
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(additionalHeaders)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }

    let middlewareRequest: MapClientRequest = {
      method,
      path,
      body,
      headers: { ...headers },
    };

    // Execute before middleware (forward order)
    for (const mw of this.middlewareStack) {
      if (mw.before) {
        try {
          middlewareRequest = await mw.before(middlewareRequest);
        } catch (err) {
          let error = err as Error;
          error = await this.runErrorMiddleware(error);
          throw error;
        }
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await this.doRequest<T, B>(
          middlewareRequest.method,
          middlewareRequest.path,
          url,
          middlewareRequest.body as B | undefined,
          middlewareRequest.headers
        );

        // Execute after middleware (forward order)
        let middlewareResponse: MapClientResponse = {
          statusCode: 200,
          headers: {},
          body: result,
        };
        for (const mw of this.middlewareStack) {
          if (mw.after) {
            try {
              middlewareResponse = await mw.after(middlewareResponse);
            } catch (err) {
              let error = err as Error;
              error = await this.runErrorMiddleware(error);
              throw error;
            }
          }
        }

        return result;
      } catch (err) {
        lastError = err as Error;

        if (attempt === this.retryAttempts) break;

        if (err instanceof MapAPIError) {
          if (!ERROR_CODE_RETRYABLE_MAP[err.code]) {
            lastError = await this.runErrorMiddleware(lastError);
            throw lastError;
          }
        } else if (err instanceof MapError && !(err instanceof MapAPIError)) {
          if (err.name === 'MapTimeoutError') {
            // Timeout is retryable
          } else {
            lastError = await this.runErrorMiddleware(lastError);
            throw lastError;
          }
        }

        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    lastError = await this.runErrorMiddleware(lastError || new MapError('Request failed after retries'));
    throw lastError;
  }

  /**
   * Run error middleware handlers in reverse order
   */
  private async runErrorMiddleware(error: Error): Promise<Error> {
    let currentError = error;
    for (let i = this.middlewareStack.length - 1; i >= 0; i--) {
      const mw = this.middlewareStack[i];
      if (mw.onError) {
        try {
          currentError = await mw.onError(currentError);
        } catch {
          // Keep the original error if error handler itself fails
        }
      }
    }
    return currentError;
  }

  private async doRequest<T, B>(
    method: string,
    path: string,
    url: string,
    body: B | undefined,
    additionalHeaders: Record<string, string>
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
    };

    // Merge middleware-provided headers (they take priority over defaults)
    for (const [key, value] of Object.entries(additionalHeaders)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }

    if (this.signer) {
      const timestamp = new Date().toISOString();
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const { signature } = await this.signer.signRequest(
        method,
        path,
        timestamp,
        bodyStr
      );

      headers['x-map-auth-scheme'] = 'signed_request';
      headers['x-map-key-id'] = this.signer.kid;
      headers['x-map-timestamp'] = timestamp;
      headers['x-map-request-signature'] = signature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as {
          error?: {
            code?: string;
            message?: string;
            retryable?: boolean;
            details?: Record<string, unknown>;
          };
          request_id?: string;
        };
        const err = errorBody?.error;
        throw new MapAPIError({
          code: (err?.code as ErrorCode) ?? 'request_failed',
          message: err?.message ?? `HTTP ${response.status}`,
          retryable: err?.retryable ?? response.status >= 500,
          status: response.status,
          details: err?.details,
          request_id: errorBody?.request_id,
        });
      }

      return await response.json() as T;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof MapError) throw err;
      throw new MapError(`Request failed: ${(err as Error).message}`);
    }
  }

  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryDelayMs * Math.pow(2, attempt),
      this.retryMaxDelayMs
    );
    const jitter = exponentialDelay * this.retryJitter * (Math.random() * 2 - 1);
    return Math.floor(exponentialDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build query string from parameters
   */
  private buildQuery(params: Record<string, string | undefined>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, value);
      }
    }
    const query = searchParams.toString();
    return query ? `?${query}` : '';
  }
}
