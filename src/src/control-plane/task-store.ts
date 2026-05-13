import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExecutionReceipt, ResultPackage, TaskRecord } from "../types.js";

interface TaskStoreOptions {
  filePath?: string;
  dbPath?: string;
}

/**
 * Terminal states are IMMUTABLE. Any attempt to transition from a terminal
 * state MUST be rejected.
 */
const TERMINAL_TASK_STATUSES = new Set<TaskRecord["status"]>([
  "completed",
  "failed",
  "denied",
  "revoked",
]);

/**
 * Formal task state transition table.
 *
 *   accepted          → [proposed, denied, revoked]
 *   proposed          → [awaiting_approval, running, denied, revoked]
 *   awaiting_approval → [running, denied, revoked]
 *   running           → [completed, failed, revoked]
 *   completed         → [] (terminal — immutable)
 *   failed            → [] (terminal — immutable)
 *   denied            → [] (terminal — immutable)
 *   revoked           → [] (terminal — immutable)
 */
const TASK_TRANSITIONS = new Map<TaskRecord["status"], TaskRecord["status"][]>([
  ["accepted", ["proposed", "denied", "revoked"]],
  ["proposed", ["awaiting_approval", "running", "denied", "revoked"]],
  ["awaiting_approval", ["running", "denied", "revoked"]],
  ["running", ["completed", "failed", "revoked"]],
  ["completed", []],
  ["failed", []],
  ["denied", []],
  ["revoked", []],
]);

function assertValidTransition(
  currentStatus: TaskRecord["status"],
  newStatus: TaskRecord["status"],
): void {
  if (currentStatus === newStatus) {
    return;
  }
  if (isTerminal(currentStatus)) {
    throw new Error(
      `Terminal states are IMMUTABLE. Cannot transition from ${currentStatus} to ${newStatus}.`,
    );
  }
  const allowed = TASK_TRANSITIONS.get(currentStatus);
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid state transition: ${currentStatus} → ${newStatus}.`,
    );
  }
}

function isTerminal(status: TaskRecord["status"]): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

export class TaskStore {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly filePath?: string;
  private readonly dbPath?: string;
  private readonly db?: DatabaseSync;

  constructor(options: TaskStoreOptions = {}) {
    this.filePath = options.filePath;
    this.dbPath = options.dbPath;
    if (this.dbPath) {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          task_id TEXT PRIMARY KEY,
          requester_identity_json TEXT NOT NULL,
          idempotency_key TEXT,
          capability TEXT NOT NULL,
          target_agent TEXT NOT NULL,
          status TEXT NOT NULL,
          result_json TEXT,
          receipt_json TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_idempotency_key ON tasks(idempotency_key);
      `);
      try {
        this.db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency_key_unique
            ON tasks(idempotency_key)
            WHERE idempotency_key IS NOT NULL;
        `);
      } catch {
        // Keep startup resilient if legacy data contains duplicate idempotency keys.
      }
    }
    this.hydrate();
  }

  save(params: {
    task_id: string;
    context_id?: string;
    requester_identity: TaskRecord["requester_identity"];
    idempotency_key?: string;
    capability: string;
    target_agent: string;
    result: ResultPackage;
    receipt: ExecutionReceipt;
  }): TaskRecord {
    const existing = this.tasks.get(params.task_id);
    if (existing) {
      throw new Error(`Task already exists: ${params.task_id}`);
    }
    if (params.idempotency_key) {
      const existingTaskId = this.idempotencyIndex.get(params.idempotency_key);
      if (existingTaskId && existingTaskId !== params.task_id) {
        throw new Error(
          `Idempotency key already exists: ${params.idempotency_key}`,
        );
      }
    }

    // Reject creation of tasks in terminal state
    if (isTerminal(params.result.status)) {
      throw new Error(
        `Cannot create task in terminal state: ${params.result.status}`,
      );
    }

    const record: TaskRecord = {
      task_id: params.task_id,
      context_id: params.context_id,
      requester_identity: params.requester_identity,
      idempotency_key: params.idempotency_key,
      capability: params.capability,
      target_agent: params.target_agent,
      status: params.result.status,
      result: params.result,
      receipt: params.receipt,
      updated_at: new Date().toISOString(),
    };

    this.tasks.set(record.task_id, record);
    if (record.idempotency_key) {
      this.idempotencyIndex.set(record.idempotency_key, record.task_id);
    }
    this.persist();
    return record;
  }

  get(taskId: string, historyLength?: number): TaskRecord | undefined {
    const record = this.tasks.get(taskId);
    if (!record) return undefined;
    return this.applyHistoryLength(record, historyLength);
  }

  getByTenant(
    taskId: string,
    tenantId: string,
    historyLength?: number,
  ): TaskRecord | undefined {
    const record = this.tasks.get(taskId);
    if (!record) {
      return undefined;
    }

    const recordTenant = this.resolveTenantId(
      record.requester_identity.tenant_id,
    );
    const matched =
      recordTenant === this.resolveTenantId(tenantId) ? record : undefined;
    if (!matched) return undefined;
    return this.applyHistoryLength(matched, historyLength);
  }

  update(
    taskId: string,
    updates: Partial<Omit<TaskRecord, "task_id">>,
  ): TaskRecord | undefined {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      return undefined;
    }
    const nextStatus = updates.status ?? existing.status;
    this.validateTransition(existing, nextStatus, updates);

    const next: TaskRecord = {
      ...existing,
      ...updates,
      task_id: existing.task_id,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    this.tasks.set(taskId, next);
    this.persist();
    return next;
  }

  list(historyLength?: number): TaskRecord[] {
    const records = [...this.tasks.values()];
    if (historyLength === undefined) return records;
    return records.map((r) => this.applyHistoryLength(r, historyLength));
  }

  listByTenant(tenantId: string, historyLength?: number): TaskRecord[] {
    const normalizedTenantId = this.resolveTenantId(tenantId);
    const records = this.list(historyLength).filter(
      (record) =>
        this.resolveTenantId(record.requester_identity.tenant_id) ===
        normalizedTenantId,
    );
    return records;
  }

  findByIdempotencyKey(idempotencyKey: string): TaskRecord | undefined {
    const taskId = this.idempotencyIndex.get(idempotencyKey);
    if (!taskId) {
      return undefined;
    }
    return this.tasks.get(taskId);
  }

  listReceipts(tenantId?: string): ExecutionReceipt[] {
    const records = tenantId ? this.listByTenant(tenantId) : this.list();
    return records
      .map((record) => record.receipt)
      .filter((receipt): receipt is ExecutionReceipt => Boolean(receipt));
  }

  getReceipt(
    receiptId: string,
    tenantId?: string,
  ): ExecutionReceipt | undefined {
    const receipts = this.listReceipts(tenantId);
    return receipts.find((receipt) => receipt.receipt_id === receiptId);
  }

  delete(taskId: string): boolean {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      return false;
    }
    this.tasks.delete(taskId);
    if (existing.idempotency_key) {
      this.idempotencyIndex.delete(existing.idempotency_key);
    }
    this.persist();
    return true;
  }

  private hydrate(): void {
    if (this.db) {
      try {
        const rows = this.db
          .prepare(
            `SELECT
              task_id,
              requester_identity_json,
              idempotency_key,
              capability,
              target_agent,
              status,
              result_json,
              receipt_json,
              updated_at
             FROM tasks`,
          )
          .all() as Array<{
          task_id: string;
          requester_identity_json: string;
          idempotency_key: string | null;
          capability: string;
          target_agent: string;
          status: TaskRecord["status"];
          result_json: string | null;
          receipt_json: string | null;
          updated_at: string;
        }>;
        for (const row of rows) {
          this.tasks.set(row.task_id, {
            task_id: row.task_id,
            requester_identity: JSON.parse(row.requester_identity_json),
            idempotency_key: row.idempotency_key ?? undefined,
            capability: row.capability,
            target_agent: row.target_agent,
            status: row.status,
            result: row.result_json
              ? (JSON.parse(row.result_json) as ResultPackage)
              : undefined,
            receipt: row.receipt_json
              ? (JSON.parse(row.receipt_json) as ExecutionReceipt)
              : undefined,
            updated_at: row.updated_at,
          });
          if (row.idempotency_key) {
            this.idempotencyIndex.set(row.idempotency_key, row.task_id);
          }
        }
      } catch {
        // Keep in-memory store empty if DB is malformed or unreadable in reference mode.
      }
      return;
    }

    if (!this.filePath || !existsSync(this.filePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { tasks?: TaskRecord[] };
      const records = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      for (const record of records) {
        if (record?.task_id) {
          this.tasks.set(record.task_id, record);
          if (record.idempotency_key) {
            this.idempotencyIndex.set(record.idempotency_key, record.task_id);
          }
        }
      }
    } catch {
      // On malformed persistence content we keep an empty in-memory store.
    }
  }

  private persist(): void {
    if (this.db) {
      const upsert = this.db.prepare(
        `INSERT INTO tasks (
          task_id,
          requester_identity_json,
          idempotency_key,
          capability,
          target_agent,
          status,
          result_json,
          receipt_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          requester_identity_json = excluded.requester_identity_json,
          idempotency_key = excluded.idempotency_key,
          capability = excluded.capability,
          target_agent = excluded.target_agent,
          status = excluded.status,
          result_json = excluded.result_json,
          receipt_json = excluded.receipt_json,
          updated_at = excluded.updated_at`,
      );

      try {
        this.db.exec("BEGIN");
        for (const record of this.list()) {
          upsert.run(
            record.task_id,
            JSON.stringify(record.requester_identity),
            record.idempotency_key ?? null,
            record.capability,
            record.target_agent,
            record.status,
            record.result ? JSON.stringify(record.result) : null,
            record.receipt ? JSON.stringify(record.receipt) : null,
            record.updated_at,
          );
        }
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      return;
    }

    if (!this.filePath) {
      return;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      JSON.stringify({ tasks: this.list() }, null, 2),
      "utf8",
    );
  }

  private applyHistoryLength(
    record: TaskRecord,
    historyLength?: number,
  ): TaskRecord {
    if (historyLength === undefined) return record;
    if (historyLength === 0) {
      const { result, receipt, ...rest } = record;
      return rest as TaskRecord;
    }
    return record;
  }

  private resolveTenantId(tenantId: string | undefined): string {
    return tenantId && tenantId.trim().length > 0 ? tenantId : "default";
  }

  private validateTransition(
    existing: TaskRecord,
    nextStatus: TaskRecord["status"],
    updates: Partial<Omit<TaskRecord, "task_id">>,
  ): void {
    if (
      updates.idempotency_key !== undefined &&
      updates.idempotency_key !== existing.idempotency_key
    ) {
      throw new Error(
        `Idempotency key is immutable for task ${existing.task_id}.`,
      );
    }
    if (
      updates.requester_identity !== undefined &&
      JSON.stringify(updates.requester_identity) !==
        JSON.stringify(existing.requester_identity)
    ) {
      throw new Error(
        `Task lifecycle invariant violated: requester_identity is immutable for task ${existing.task_id}.`,
      );
    }
    if (
      updates.capability !== undefined &&
      updates.capability !== existing.capability
    ) {
      throw new Error(
        `Task lifecycle invariant violated: capability is immutable for task ${existing.task_id}.`,
      );
    }
    if (
      updates.target_agent !== undefined &&
      updates.target_agent !== existing.target_agent
    ) {
      throw new Error(
        `Task lifecycle invariant violated: target_agent is immutable for task ${existing.task_id}.`,
      );
    }
    if (updates.result !== undefined) {
      if (updates.result.task_id !== existing.task_id) {
        throw new Error(
          `Task lifecycle invariant violated: result.task_id mismatch for task ${existing.task_id}.`,
        );
      }
      if (updates.result.status !== nextStatus) {
        throw new Error(
          `Task lifecycle invariant violated: result.status must match task status for task ${existing.task_id}.`,
        );
      }
    }
    if (
      updates.receipt !== undefined &&
      updates.receipt.task_id !== existing.task_id
    ) {
      throw new Error(
        `Task lifecycle invariant violated: receipt.task_id mismatch for task ${existing.task_id}.`,
      );
    }
    if (existing.status === nextStatus) {
      if (!isTerminal(existing.status)) {
        return;
      }
      const resultChanged =
        updates.result !== undefined &&
        JSON.stringify(updates.result) !== JSON.stringify(existing.result);
      const receiptChanged =
        updates.receipt !== undefined &&
        JSON.stringify(updates.receipt) !== JSON.stringify(existing.receipt);
      if (resultChanged || receiptChanged) {
        throw new Error(
          `Terminal task state is immutable for task ${existing.task_id} (${existing.status}).`,
        );
      }
      return;
    }

    // Atomic guard: enforce formal transition table
    assertValidTransition(existing.status, nextStatus);

    if (updates.result === undefined || updates.receipt === undefined) {
      throw new Error(
        `Task lifecycle invariant violated: transitions must include result and receipt for task ${existing.task_id}.`,
      );
    }
  }
}
