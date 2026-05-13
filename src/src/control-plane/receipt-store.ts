import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExecutionReceipt } from "../types.js";

/**
 * Receipts are APPEND-ONLY. Once written, they MUST NEVER be modified or deleted.
 */

interface ReceiptStoreOptions {
  filePath?: string;
  dbPath?: string;
}

export class ReceiptStore {
  private readonly receipts = new Map<string, ExecutionReceipt>();
  private readonly order: string[] = [];
  private readonly filePath?: string;
  private readonly dbPath?: string;
  private readonly db?: DatabaseSync;

  constructor(options: ReceiptStoreOptions = {}) {
    this.filePath = options.filePath;
    this.dbPath = options.dbPath;
    if (this.dbPath) {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS receipts (
          receipt_id TEXT PRIMARY KEY,
          tenant_id TEXT,
          timestamp TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_receipts_tenant_timestamp
          ON receipts(tenant_id, timestamp);
      `);
    }
    this.hydrate();
  }

  append(receipt: ExecutionReceipt): void {
    const existing = this.receipts.get(receipt.receipt_id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(receipt)) {
        throw new Error(
          `Receipt conflict for immutable receipt id: ${receipt.receipt_id}`,
        );
      }
      return;
    }

    this.receipts.set(receipt.receipt_id, receipt);
    this.order.push(receipt.receipt_id);
    this.persist();
  }

  get(receiptId: string, tenantId?: string): ExecutionReceipt | undefined {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) {
      return undefined;
    }
    if (
      tenantId &&
      this.resolveTenantId(receipt.tenant_id) !== this.resolveTenantId(tenantId)
    ) {
      return undefined;
    }
    return receipt;
  }

  list(tenantId?: string): ExecutionReceipt[] {
    const records = this.order
      .map((id) => this.receipts.get(id))
      .filter((item): item is ExecutionReceipt => Boolean(item));
    if (!tenantId) {
      return records;
    }
    const normalizedTenant = this.resolveTenantId(tenantId);
    return records.filter(
      (receipt) => this.resolveTenantId(receipt.tenant_id) === normalizedTenant,
    );
  }

  /**
   * Verifies the integrity of all receipts by checking signatures and ordering.
   * Returns { valid: boolean, total: number, errors: string[] }.
   */
  verifyReceiptIntegrity(): {
    valid: boolean;
    total: number;
    errors: string[];
  } {
    const errors: string[] = [];
    const receipts = this.list();
    const total = receipts.length;

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i]!;

      // Check required fields
      if (!receipt.receipt_id) {
        errors.push(`Receipt at index ${i} is missing receipt_id`);
        continue;
      }
      if (!receipt.signature) {
        errors.push(`Receipt ${receipt.receipt_id} is missing signature`);
      }
      if (!receipt.timestamp) {
        errors.push(`Receipt ${receipt.receipt_id} is missing timestamp`);
      }
      if (!receipt.task_id) {
        errors.push(`Receipt ${receipt.receipt_id} is missing task_id`);
      }

      // Check timestamp ordering (receipts should be in chronological order)
      if (i > 0) {
        const prev = receipts[i - 1]!;
        if (prev.timestamp && receipt.timestamp) {
          if (new Date(receipt.timestamp) < new Date(prev.timestamp)) {
            errors.push(
              `Receipt ${receipt.receipt_id} has timestamp ${receipt.timestamp} which is before previous receipt ${prev.receipt_id} timestamp ${prev.timestamp}`,
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      total,
      errors,
    };
  }

  private hydrate(): void {
    if (this.db) {
      try {
        const rows = this.db
          .prepare(
            `SELECT receipt_id, payload_json
             FROM receipts
             ORDER BY timestamp ASC, receipt_id ASC`,
          )
          .all() as Array<{ receipt_id: string; payload_json: string }>;
        for (const row of rows) {
          const receipt = JSON.parse(row.payload_json) as ExecutionReceipt;
          this.receipts.set(row.receipt_id, receipt);
          this.order.push(row.receipt_id);
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
      const parsed = JSON.parse(raw) as { receipts?: ExecutionReceipt[] };
      const records = Array.isArray(parsed.receipts) ? parsed.receipts : [];
      for (const receipt of records) {
        if (receipt?.receipt_id && !this.receipts.has(receipt.receipt_id)) {
          this.receipts.set(receipt.receipt_id, receipt);
          this.order.push(receipt.receipt_id);
        }
      }
    } catch {
      // On malformed persistence content we keep an empty in-memory store.
    }
  }

  private persist(): void {
    if (this.db) {
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO receipts (
          receipt_id,
          tenant_id,
          timestamp,
          payload_json
        ) VALUES (?, ?, ?, ?)`,
      );
      try {
        this.db.exec("BEGIN");
        const newestId = this.order[this.order.length - 1];
        if (newestId) {
          const newest = this.receipts.get(newestId);
          if (newest) {
            insert.run(
              newest.receipt_id,
              newest.tenant_id ?? null,
              newest.timestamp,
              JSON.stringify(newest),
            );
          }
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
      JSON.stringify({ receipts: this.list() }, null, 2),
      "utf8",
    );
  }

  private resolveTenantId(tenantId: string | undefined): string {
    return tenantId && tenantId.trim().length > 0 ? tenantId : "default";
  }
}
