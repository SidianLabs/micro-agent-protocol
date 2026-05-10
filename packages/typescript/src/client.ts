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
   * Make an HTTP request with retry logic
   */
  private async request<T, B = unknown>(
    method: string,
    path: string,
    body?: B,
    additionalHeaders: Record<string, string | undefined> = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await this.doRequest<T, B>(method, path, url, body, additionalHeaders);
        return result;
      } catch (err) {
        lastError = err as Error;

        if (attempt === this.retryAttempts) break;

        if (err instanceof MapAPIError) {
          if (!ERROR_CODE_RETRYABLE_MAP[err.code]) {
            throw err;
          }
        } else if (err instanceof MapError && !(err instanceof MapAPIError)) {
          if (err.name === 'MapTimeoutError') {
            // Timeout is retryable
          } else {
            throw err;
          }
        }

        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError || new MapError('Request failed after retries');
  }

  private async doRequest<T, B>(
    method: string,
    path: string,
    url: string,
    body: B | undefined,
    additionalHeaders: Record<string, string | undefined>
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
    };

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

      if (additionalHeaders['x-map-idempotency-key']) {
        headers['x-map-idempotency-key'] = additionalHeaders['x-map-idempotency-key'] as string;
      }
    }

    for (const [key, value] of Object.entries(additionalHeaders)) {
      if (value !== undefined && key !== 'x-map-idempotency-key') {
        headers[key] = value;
      }
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
          code?: string;
          message?: string;
          retryable?: boolean;
          details?: Record<string, unknown>;
        };
        throw new MapAPIError({
          code: (errorBody?.code as ErrorCode) ?? 'request_failed',
          message: errorBody?.message ?? `HTTP ${response.status}`,
          retryable: errorBody?.retryable ?? response.status >= 500,
          status: response.status,
          details: errorBody?.details,
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
