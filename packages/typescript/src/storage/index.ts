/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskRecord, ExecutionReceipt, ResultPackage } from '../types.js';

export interface TaskStoreOptions {
  persistencePath?: string;
  maxTasks?: number;
}

export interface StorageResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class InMemoryTaskStore {
  private tasks: Map<string, TaskRecord> = new Map();
  private maxTasks: number;
  private accessOrder: string[] = [];

  constructor(options: TaskStoreOptions = {}) {
    this.maxTasks = options.maxTasks ?? 10000;
  }

  async save(task: TaskRecord): Promise<StorageResult<TaskRecord>> {
    try {
      this.tasks.set(task.task_id, { ...task, updated_at: new Date().toISOString() });
      this.updateAccessOrder(task.task_id);
      this.evictIfNeeded();
      return { ok: true, data: task };
    } catch (error) {
      return { ok: false, error: `Failed to save task: ${(error as Error).message}` };
    }
  }

  async get(taskId: string): Promise<StorageResult<TaskRecord>> {
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        return { ok: false, error: `Task not found: ${taskId}` };
      }
      this.updateAccessOrder(taskId);
      return { ok: true, data: task };
    } catch (error) {
      return { ok: false, error: `Failed to get task: ${(error as Error).message}` };
    }
  }

  async list(filter?: {
    tenant_id?: string;
    status?: string;
    capability?: string;
    agent_id?: string;
    limit?: number;
    cursor?: string;
  }): Promise<StorageResult<{ tasks: TaskRecord[]; nextCursor?: string }>> {
    try {
      let tasks = Array.from(this.tasks.values());

      if (filter?.tenant_id) {
        tasks = tasks.filter(t => t.requester_identity.tenant_id === filter.tenant_id);
      }
      if (filter?.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter?.capability) {
        tasks = tasks.filter(t => t.capability === filter.capability);
      }
      if (filter?.agent_id) {
        tasks = tasks.filter(t => t.target_agent === filter.agent_id);
      }

      tasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const cursorIndex = filter?.cursor ? this.accessOrder.indexOf(filter.cursor) + 1 : 0;
      const limit = filter?.limit ?? 50;
      const paginatedTasks = tasks.slice(cursorIndex, cursorIndex + limit);
      const nextCursor = paginatedTasks.length === limit ? paginatedTasks[paginatedTasks.length - 1]?.task_id : undefined;

      return { ok: true, data: { tasks: paginatedTasks, nextCursor } };
    } catch (error) {
      return { ok: false, error: `Failed to list tasks: ${(error as Error).message}` };
    }
  }

  async delete(taskId: string): Promise<StorageResult<void>> {
    try {
      if (!this.tasks.has(taskId)) {
        return { ok: false, error: `Task not found: ${taskId}` };
      }
      this.tasks.delete(taskId);
      this.accessOrder = this.accessOrder.filter(id => id !== taskId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Failed to delete task: ${(error as Error).message}` };
    }
  }

  async count(filter?: { tenant_id?: string; status?: string }): Promise<StorageResult<number>> {
    try {
      let tasks = Array.from(this.tasks.values());
      if (filter?.tenant_id) {
        tasks = tasks.filter(t => t.requester_identity.tenant_id === filter.tenant_id);
      }
      if (filter?.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      return { ok: true, data: tasks.length };
    } catch (error) {
      return { ok: false, error: `Failed to count tasks: ${(error as Error).message}` };
    }
  }

  private updateAccessOrder(taskId: string): void {
    this.accessOrder = this.accessOrder.filter(id => id !== taskId);
    this.accessOrder.push(taskId);
  }

  private evictIfNeeded(): void {
    while (this.tasks.size > this.maxTasks && this.accessOrder.length > 0) {
      const oldestId = this.accessOrder.shift();
      if (oldestId) {
        this.tasks.delete(oldestId);
      }
    }
  }

  clear(): void {
    this.tasks.clear();
    this.accessOrder = [];
  }
}

export interface ReceiptStoreOptions {
  persistencePath?: string;
  maxReceipts?: number;
}

export class InMemoryReceiptStore {
  private receipts: Map<string, ExecutionReceipt> = new Map();
  private taskReceipts: Map<string, string> = new Map();
  private maxReceipts: number;
  private accessOrder: string[] = [];

  constructor(options: ReceiptStoreOptions = {}) {
    this.maxReceipts = options.maxReceipts ?? 50000;
  }

  async save(receipt: ExecutionReceipt): Promise<StorageResult<ExecutionReceipt>> {
    try {
      this.receipts.set(receipt.receipt_id, receipt);
      this.taskReceipts.set(receipt.task_id, receipt.receipt_id);
      this.updateAccessOrder(receipt.receipt_id);
      this.evictIfNeeded();
      return { ok: true, data: receipt };
    } catch (error) {
      return { ok: false, error: `Failed to save receipt: ${(error as Error).message}` };
    }
  }

  async get(receiptId: string): Promise<StorageResult<ExecutionReceipt>> {
    try {
      const receipt = this.receipts.get(receiptId);
      if (!receipt) {
        return { ok: false, error: `Receipt not found: ${receiptId}` };
      }
      this.updateAccessOrder(receiptId);
      return { ok: true, data: receipt };
    } catch (error) {
      return { ok: false, error: `Failed to get receipt: ${(error as Error).message}` };
    }
  }

  async getByTaskId(taskId: string): Promise<StorageResult<ExecutionReceipt>> {
    try {
      const receiptId = this.taskReceipts.get(taskId);
      if (!receiptId) {
        return { ok: false, error: `Receipt not found for task: ${taskId}` };
      }
      return this.get(receiptId);
    } catch (error) {
      return { ok: false, error: `Failed to get receipt by task ID: ${(error as Error).message}` };
    }
  }

  async list(filter?: {
    tenant_id?: string;
    agent_id?: string;
    limit?: number;
    cursor?: string;
  }): Promise<StorageResult<{ receipts: ExecutionReceipt[]; nextCursor?: string }>> {
    try {
      let receipts = Array.from(this.receipts.values());

      if (filter?.tenant_id) {
        receipts = receipts.filter(r => r.tenant_id === filter.tenant_id);
      }
      if (filter?.agent_id) {
        receipts = receipts.filter(r => r.agent_id === filter.agent_id);
      }

      receipts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const cursorIndex = filter?.cursor ? this.accessOrder.indexOf(filter.cursor) + 1 : 0;
      const limit = filter?.limit ?? 50;
      const paginatedReceipts = receipts.slice(cursorIndex, cursorIndex + limit);
      const nextCursor = paginatedReceipts.length === limit ? paginatedReceipts[paginatedReceipts.length - 1]?.receipt_id : undefined;

      return { ok: true, data: { receipts: paginatedReceipts, nextCursor } };
    } catch (error) {
      return { ok: false, error: `Failed to list receipts: ${(error as Error).message}` };
    }
  }

  async delete(receiptId: string): Promise<StorageResult<void>> {
    try {
      const receipt = this.receipts.get(receiptId);
      if (!receipt) {
        return { ok: false, error: `Receipt not found: ${receiptId}` };
      }
      this.receipts.delete(receiptId);
      this.taskReceipts.delete(receipt.task_id);
      this.accessOrder = this.accessOrder.filter(id => id !== receiptId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Failed to delete receipt: ${(error as Error).message}` };
    }
  }

  private updateAccessOrder(receiptId: string): void {
    this.accessOrder = this.accessOrder.filter(id => id !== receiptId);
    this.accessOrder.push(receiptId);
  }

  private evictIfNeeded(): void {
    while (this.receipts.size > this.maxReceipts && this.accessOrder.length > 0) {
      const oldestId = this.accessOrder.shift();
      if (oldestId) {
        const receipt = this.receipts.get(oldestId);
        if (receipt) {
          this.taskReceipts.delete(receipt.task_id);
        }
        this.receipts.delete(oldestId);
      }
    }
  }

  clear(): void {
    this.receipts.clear();
    this.taskReceipts.clear();
    this.accessOrder = [];
  }
}

export class CompositeStore {
  readonly tasks: InMemoryTaskStore;
  readonly receipts: InMemoryReceiptStore;

  constructor(taskOptions?: TaskStoreOptions, receiptOptions?: ReceiptStoreOptions) {
    this.tasks = new InMemoryTaskStore(taskOptions);
    this.receipts = new InMemoryReceiptStore(receiptOptions);
  }

  async saveTaskWithReceipt(task: TaskRecord, result: ResultPackage, receipt: ExecutionReceipt): Promise<StorageResult<void>> {
    try {
      const taskWithResult: TaskRecord = {
        ...task,
        result,
        receipt,
        updated_at: new Date().toISOString(),
      };
      const taskResult = await this.tasks.save(taskWithResult);
      if (!taskResult.ok) {
        return { ok: false, error: taskResult.error };
      }
      const receiptResult = await this.receipts.save(receipt);
      if (!receiptResult.ok) {
        return { ok: false, error: receiptResult.error };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Failed to save task with receipt: ${(error as Error).message}` };
    }
  }

  clear(): void {
    this.tasks.clear();
    this.receipts.clear();
  }
}