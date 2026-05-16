/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  DispatchRequest,
  InvokeResult,
  ErrorCode,
  TaskStatus,
} from '../generated-map-types.js';
import { MapError, MapAPIError } from '../errors.js';

/**
 * WebSocket transport options
 */
export interface WebSocketOptions {
  timeout?: number;
  reconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  pingIntervalMs?: number;
  pingTimeoutMs?: number;
}

/**
 * Task status update from streaming
 */
export interface TaskStatusUpdate {
  task_id: string;
  status: TaskStatus;
  timestamp: string;
  message?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

/**
 * WebSocket message types
 */
type WebSocketMessage =
  | { type: 'dispatch'; request: DispatchRequest; id: string }
  | { type: 'dispatch_batch'; requests: DispatchRequest[]; parallel: boolean; id: string }
  | { type: 'task_status_stream'; task_id: string }
  | { type: 'ping' }
  | { type: 'close' };

type WebSocketResponse =
  | { type: 'dispatch_result'; id: string; result: InvokeResult; error?: never }
  | { type: 'dispatch_error'; id: string; error: MapAPIError; result?: never }
  | { type: 'batch_result'; id: string; results: InvokeResult[]; errors: Array<{ index: number; error: MapAPIError }> }
  | { type: 'task_status'; update: TaskStatusUpdate }
  | { type: 'pong' }
  | { type: 'error'; message: string };

/**
 * WebSocket transport for MAP Protocol
 *
 * Provides real-time dispatch and task status streaming over WebSocket.
 */
export class WebSocketTransport {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly options: Required<WebSocketOptions>;
  private pendingRequests: Map<string, {
    resolve: (result: InvokeResult) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private statusStreams: Map<string, {
    controller: ReadableStreamDefaultController<TaskStatusUpdate>;
  }> = new Map();
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = false;
  private isIntentionallyClosed = false;

  constructor(url: string, options: WebSocketOptions = {}) {
    this.url = url;
    this.options = {
      timeout: options.timeout ?? 30000,
      reconnect: options.reconnect ?? true,
      reconnectIntervalMs: options.reconnectIntervalMs ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      pingIntervalMs: options.pingIntervalMs ?? 30000,
      pingTimeoutMs: options.pingTimeoutMs ?? 5000,
    };
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';

      const connectionTimeout = setTimeout(() => {
        this.ws?.close();
        reject(new MapError('WebSocket connection timeout'));
      }, this.options.timeout);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.startPingInterval();
        resolve();
      };

      this.ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        reject(new MapError(`WebSocket error: ${event.type}`));
      };

      this.ws.onclose = () => {
        this.stopPingInterval();
        if (this.shouldReconnect && !this.isIntentionallyClosed) {
          this.attemptReconnect();
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Dispatch a request via WebSocket
   */
  async dispatch(request: DispatchRequest): Promise<InvokeResult> {
    await this.ensureConnected();

    const id = this.generateId();
    const message: WebSocketMessage = { type: 'dispatch', request, id };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MapError(`Dispatch request ${id} timed out`));
      }, this.options.timeout);

      this.send(message).catch((err) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  /**
   * Stream task status updates
   */
  async streamTaskStatus(taskId: string): Promise<AsyncIterable<TaskStatusUpdate>> {
    await this.ensureConnected();

    const stream = new ReadableStream<TaskStatusUpdate>({
      start: (controller) => {
        this.statusStreams.set(taskId, { controller });
        // Send subscription message
        const message: WebSocketMessage = { type: 'task_status_stream', task_id: taskId };
        this.send(message).catch((err) => {
          controller.error(err);
        });
      },
      cancel: () => {
        this.statusStreams.delete(taskId);
      },
    });

    return stream;
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    this.isIntentionallyClosed = true;
    this.shouldReconnect = false;
    this.stopPingInterval();

    // Cancel all pending requests
    for (const [, { reject }] of this.pendingRequests) {
      reject(new MapError('WebSocket connection closed'));
    }
    this.pendingRequests.clear();

    // Cancel all status streams
    for (const [, { controller }] of this.statusStreams) {
      controller.close();
    }
    this.statusStreams.clear();

    if (this.ws) {
      this.ws.close(1000, 'Client closing');
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }

  private send(message: WebSocketMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new MapError('WebSocket not connected'));
        return;
      }

      try {
        this.ws.send(JSON.stringify(message));
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      return;
    }

    try {
      const response = JSON.parse(data) as WebSocketResponse;

      switch (response.type) {
        case 'dispatch_result': {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            pending.resolve(response.result);
          }
          break;
        }

        case 'dispatch_error': {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            pending.reject(response.error);
          }
          break;
        }

        case 'batch_result': {
          // For batch results, we would need a different mechanism
          // This is a simplified handling
          break;
        }

        case 'task_status': {
          const stream = this.statusStreams.get(response.update.task_id);
          if (stream) {
            try {
              stream.controller.enqueue(response.update);
            } catch {
              this.statusStreams.delete(response.update.task_id);
            }
          }
          break;
        }

        case 'pong': {
          // Ping acknowledged
          break;
        }

        case 'error': {
          console.error('WebSocket error from server:', response.message);
          break;
        }
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.connect();
        console.log('Reconnected successfully');
      } catch (err) {
        console.error('Reconnection failed:', err);
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      }
    }, delay);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' }).catch(() => {
          // Ping failed, connection may be dead
        });
      }
    }, this.options.pingIntervalMs);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
  }
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
 * Create a batch dispatch result from WebSocket response
 */
export function createBatchDispatchResult(
  results: InvokeResult[],
  errors: Array<{ index: number; error: MapAPIError }>
): BatchDispatchResult {
  return {
    results,
    errors: errors.map(e => ({
      index: e.index,
      error: {
        code: e.error.code,
        message: e.error.message,
        status: e.error.status ?? 500,
      },
    })),
  };
}
