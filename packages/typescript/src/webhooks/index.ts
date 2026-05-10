/**
 * MAP Protocol - Webhooks Module
 *
 * Event notification system for task lifecycle events
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskStatus } from '../types.js';

export enum WebhookEventType {
  TASK_DISPATCHED = 'task.dispatched',
  TASK_PROPOSED = 'task.proposed',
  TASK_ACCEPTED = 'task.accepted',
  TASK_AWAITING_APPROVAL = 'task.awaiting_approval',
  TASK_DENIED = 'task.denied',
  TASK_RUNNING = 'task.running',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_REVOKED = 'task.revoked',
  AGENT_REGISTERED = 'agent.registered',
  AGENT_DEREGISTERED = 'agent.deregistered',
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
  retryCount?: number;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  enabled: boolean;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
  durationMs?: number;
}

export interface WebhookOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  maxQueueSize?: number;
}

export class WebhookQueue {
  private queue: WebhookEvent[] = [];
  private maxQueueSize: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;

  constructor(options: WebhookOptions = {}) {
    this.maxQueueSize = options.maxQueueSize ?? 10000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  enqueue(event: WebhookEvent): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      return false;
    }
    this.queue.push({ ...event, retryCount: 0 });
    return true;
  }

  dequeue(): WebhookEvent | undefined {
    return this.queue.shift();
  }

  peek(): WebhookEvent | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  getRetryDelay(event: WebhookEvent): number {
    return this.retryDelayMs * Math.pow(2, event.retryCount ?? 0);
  }

  shouldRetry(event: WebhookEvent): boolean {
    return (event.retryCount ?? 0) < this.maxRetries;
  }

  markRetried(event: WebhookEvent): WebhookEvent {
    return { ...event, retryCount: (event.retryCount ?? 0) + 1 };
  }

  clear(): void {
    this.queue = [];
  }
}

export class WebhookDispatcher {
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private eventSubscriptions: Map<WebhookEventType, Set<string>> = new Map();
  private queue: WebhookQueue;
  private isProcessing: boolean = false;

  constructor(options: WebhookOptions = {}) {
    this.queue = new WebhookQueue(options);
  }

  registerEndpoint(endpoint: WebhookEndpoint): void {
    this.endpoints.set(endpoint.id, endpoint);
    for (const eventType of endpoint.events) {
      let subscribers = this.eventSubscriptions.get(eventType);
      if (!subscribers) {
        subscribers = new Set();
        this.eventSubscriptions.set(eventType, subscribers);
      }
      subscribers.add(endpoint.id);
    }
  }

  unregisterEndpoint(endpointId: string): void {
    const endpoint = this.endpoints.get(endpointId);
    if (endpoint) {
      for (const eventType of endpoint.events) {
        const subscribers = this.eventSubscriptions.get(eventType);
        if (subscribers) {
          subscribers.delete(endpointId);
        }
      }
      this.endpoints.delete(endpointId);
    }
  }

  getEndpoint(endpointId: string): WebhookEndpoint | undefined {
    return this.endpoints.get(endpointId);
  }

  listEndpoints(): WebhookEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  async dispatchEvent(event: WebhookEvent): Promise<void> {
    const subscriberIds = this.eventSubscriptions.get(event.type);
    if (!subscriberIds || subscriberIds.size === 0) {
      return;
    }

    const deliveryPromises: Promise<unknown>[] = [];
    for (const endpointId of subscriberIds) {
      const endpoint = this.endpoints.get(endpointId);
      if (endpoint?.enabled) {
        deliveryPromises.push(this.deliverToEndpoint(event, endpoint));
      }
    }

    await Promise.allSettled(deliveryPromises);
  }

  enqueue(event: WebhookEvent): boolean {
    return this.queue.enqueue(event);
  }

  async processQueue(): Promise<WebhookDeliveryResult[]> {
    if (this.isProcessing) {
      return [];
    }
    this.isProcessing = true;
    const results: WebhookDeliveryResult[] = [];

    try {
      while (this.queue.size() > 0) {
        const event = this.queue.peek();
        if (!event) break;

        const subscriberIds = this.eventSubscriptions.get(event.type);
        if (!subscriberIds || subscriberIds.size === 0) {
          this.queue.dequeue();
          continue;
        }

        let allDelivered = true;
        for (const endpointId of subscriberIds) {
          const endpoint = this.endpoints.get(endpointId);
          if (endpoint?.enabled) {
            const result = await this.deliverToEndpoint(event, endpoint);
            results.push(result);
            if (!result.ok && this.queue.shouldRetry(event)) {
              this.queue.dequeue();
              this.queue.enqueue(this.queue.markRetried(event));
              allDelivered = false;
              break;
            }
          }
        }

        if (allDelivered) {
          this.queue.dequeue();
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  private async deliverToEndpoint(event: WebhookEvent, endpoint: WebhookEndpoint): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const payload = this.signPayload(event, endpoint.secret);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.queue['timeoutMs']);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MAP-Webhook-Event': event.type,
          'X-MAP-Webhook-Delivery': event.id,
          'X-MAP-Webhook-Signature': payload.signature,
          'X-MAP-Webhook-Timestamp': payload.timestamp,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          ok: true,
          statusCode: response.status,
          durationMs: Date.now() - startTime,
        };
      } else {
        return {
          ok: false,
          statusCode: response.status,
          error: `HTTP ${response.status}`,
          durationMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private signPayload(event: WebhookEvent, _secret: string): { signature: string; timestamp: string } {
    const timestamp = new Date().toISOString();
    const payload = `${event.id}.${timestamp}.${JSON.stringify(event.data)}`;

    const signature = Buffer.from(payload).toString('base64');

    return { signature, timestamp };
  }

  getQueueSize(): number {
    return this.queue.size();
  }
}

export function createWebhookEvent(
  type: WebhookEventType,
  data: Record<string, unknown>
): WebhookEvent {
  return {
    id: `wh_${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`,
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

export function taskStatusToEventType(status: TaskStatus): WebhookEventType {
  const mapping: Record<TaskStatus, WebhookEventType> = {
    accepted: WebhookEventType.TASK_ACCEPTED,
    proposed: WebhookEventType.TASK_PROPOSED,
    awaiting_approval: WebhookEventType.TASK_AWAITING_APPROVAL,
    denied: WebhookEventType.TASK_DENIED,
    running: WebhookEventType.TASK_RUNNING,
    completed: WebhookEventType.TASK_COMPLETED,
    failed: WebhookEventType.TASK_FAILED,
    revoked: WebhookEventType.TASK_REVOKED,
  };
  return mapping[status] ?? WebhookEventType.TASK_DISPATCHED;
}
