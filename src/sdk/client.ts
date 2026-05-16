/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ApprovalRequest,
  DispatchRequest,
  ExecutionReceipt,
  ResultPackage,
  TaskRecord
} from "../types.js";

export interface MapClientRequest {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface MapClientResponse<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export interface MapClientTransport {
  request<T = unknown>(input: MapClientRequest): Promise<MapClientResponse<T>>;
}

export interface MapClientOptions {
  defaultHeaders?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  pagination?: {
    limit: number;
    next_cursor: string | number | null;
  };
  tasks?: T[];
  receipts?: T[];
  events?: T[];
  alerts?: T[];
  dead_letters?: T[];
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function toQuery(params: Record<string, string | undefined>): string {
  const url = new URL("http://localhost");
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }
  const query = url.searchParams.toString();
  return query.length > 0 ? `?${query}` : "";
}

export class FetchMapTransport implements MapClientTransport {
  constructor(private readonly baseUrl: string) {}

  async request<T = unknown>(input: MapClientRequest): Promise<MapClientResponse<T>> {
    const response = await fetch(joinUrl(this.baseUrl, input.path), {
      method: input.method,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(input.headers ?? {})
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body)
    });
    const text = await response.text();
    const body = (text.trim().length > 0 ? (JSON.parse(text) as T) : ({} as T));
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return {
      status: response.status,
      body,
      headers: responseHeaders
    };
  }
}

export class MapAssistantClient {
  constructor(
    private readonly transport: MapClientTransport,
    private readonly options: MapClientOptions = {}
  ) {}

  static forBaseUrl(baseUrl: string, options: MapClientOptions = {}): MapAssistantClient {
    return new MapAssistantClient(new FetchMapTransport(baseUrl), options);
  }

  async getHealth() {
    return this.request("GET", "/health");
  }

  async getStatus() {
    return this.request("GET", "/status");
  }

  async getConformanceExport() {
    return this.request<{
      conformance: Record<string, unknown>;
      artifact: Record<string, unknown>;
    }>("GET", "/conformance/export");
  }

  async getTrustBundleExport() {
    return this.request<{
      trust_bundle: Record<string, unknown>;
      keys: unknown[];
    }>("GET", "/trust-bundle/export");
  }

  async listAdminKeys(options?: { includeRuntime?: boolean; includeRevoked?: boolean }) {
    const query = toQuery({
      include_runtime:
        typeof options?.includeRuntime === "boolean" ? String(options.includeRuntime) : undefined,
      include_revoked:
        typeof options?.includeRevoked === "boolean" ? String(options.includeRevoked) : undefined
    });
    return this.request<{
      keys: unknown[];
      summary: Record<string, unknown>;
      trust: Record<string, unknown>;
      key_provider: Record<string, unknown>;
    }>("GET", `/admin/keys${query}`);
  }

  async listAgents(filters?: { domain?: string; capability?: string }) {
    const query = toQuery({
      domain: filters?.domain,
      capability: filters?.capability
    });
    return this.request<{ agents: unknown[] }>("GET", `/agents${query}`);
  }

  async listTasks(filters?: { tenant_id?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id
    });
    return this.request<{ tasks: TaskRecord[]; pagination?: { limit: number; next_cursor: string | null } }>(
      "GET",
      `/tasks${query}`
    );
  }

  async listTasksPage(filters?: { tenant_id?: string; limit?: number; cursor?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id,
      limit: typeof filters?.limit === "number" ? String(filters.limit) : undefined,
      cursor: filters?.cursor
    });
    return this.request<{ tasks: TaskRecord[]; pagination: { limit: number; next_cursor: string | null } }>(
      "GET",
      `/tasks${query}`
    );
  }

  async getTask(taskId: string, options?: { tenant_id?: string }) {
    const query = toQuery({
      tenant_id: options?.tenant_id
    });
    return this.request<{ task: TaskRecord }>("GET", `/tasks/${encodeURIComponent(taskId)}${query}`);
  }

  async listReceipts(filters?: { tenant_id?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id
    });
    return this.request<{
      receipts: ExecutionReceipt[];
      pagination?: { limit: number; next_cursor: string | null };
    }>("GET", `/receipts${query}`);
  }

  async listReceiptsPage(filters?: { tenant_id?: string; limit?: number; cursor?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id,
      limit: typeof filters?.limit === "number" ? String(filters.limit) : undefined,
      cursor: filters?.cursor
    });
    return this.request<{
      receipts: ExecutionReceipt[];
      pagination: { limit: number; next_cursor: string | null };
    }>("GET", `/receipts${query}`);
  }

  async listAuditEventsPage(filters?: {
    tenant_id?: string;
    limit?: number;
    cursor?: number;
  }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id,
      limit: typeof filters?.limit === "number" ? String(filters.limit) : undefined,
      cursor: typeof filters?.cursor === "number" ? String(filters.cursor) : undefined
    });
    return this.request<{
      events: Array<Record<string, unknown>>;
      checkpoints: Array<Record<string, unknown>>;
      pagination: { limit: number; next_cursor: number | null };
    }>("GET", `/audit-events${query}`);
  }

  async getReceipt(receiptId: string, options?: { tenant_id?: string }) {
    const query = toQuery({
      tenant_id: options?.tenant_id
    });
    return this.request<{ receipt: ExecutionReceipt }>(
      "GET",
      `/receipts/${encodeURIComponent(receiptId)}${query}`
    );
  }

  async dispatch(input: DispatchRequest, options?: { idempotencyKey?: string; webhookUrl?: string }) {
    const headers: Record<string, string> = {};
    if (options?.idempotencyKey) {
      headers["x-map-idempotency-key"] = options.idempotencyKey;
    }
    if (options?.webhookUrl) {
      input = {
        ...input,
        envelope: {
          ...input.envelope,
          metadata: {
            ...(input.envelope.metadata ?? {}),
            webhook_url: options.webhookUrl
          }
        }
      };
    }
    return this.request<{ result: ResultPackage; receipt?: ExecutionReceipt }>(
      "POST",
      "/dispatch",
      input,
      headers
    );
  }

  async approve(input: ApprovalRequest) {
    return this.request<{ result: ResultPackage; receipt?: ExecutionReceipt }>(
      "POST",
      "/approve",
      input
    );
  }

  async cancelTask(taskId: string, options?: { tenant_id?: string }) {
    const query = toQuery({
      tenant_id: options?.tenant_id
    });
    return this.request<{ result: unknown; receipt?: unknown }>(
      "POST",
      `/tasks/${encodeURIComponent(taskId)}/cancel${query}`
    );
  }

  async listAlerts(filters?: { tenant_id?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id
    });
    return this.request<{ alerts: unknown[] }>("GET", `/alerts${query}`);
  }

  async listAlertsPage(filters?: { tenant_id?: string; limit?: number; cursor?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id,
      limit: typeof filters?.limit === "number" ? String(filters.limit) : undefined,
      cursor: filters?.cursor
    });
    return this.request<{
      alerts: unknown[];
      pagination: { limit: number; next_cursor: string | null };
    }>("GET", `/alerts${query}`);
  }

  async listDeadLetters(filters?: { tenant_id?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id
    });
    return this.request<{ dead_letters: unknown[] }>("GET", `/dead-letters${query}`);
  }

  async listDeadLettersPage(filters?: { tenant_id?: string; limit?: number; cursor?: string }) {
    const query = toQuery({
      tenant_id: filters?.tenant_id,
      limit: typeof filters?.limit === "number" ? String(filters.limit) : undefined,
      cursor: filters?.cursor
    });
    return this.request<{
      dead_letters: unknown[];
      pagination: { limit: number; next_cursor: string | null };
    }>("GET", `/dead-letters${query}`);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<MapClientResponse<T>> {
    return this.transport.request<T>({
      method,
      path,
      body,
      headers: {
        ...(this.options.defaultHeaders ?? {}),
        ...(headers ?? {})
      }
    });
  }
}
