/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Database Read Adapter
 *
 * Executes bounded, policy-controlled database read queries as a MAP capability.
 * PostgreSQL-compatible interface.
 *
 * Capability: "db.read"
 *
 * This adapter enforces output minimization — it never returns raw rows
 * unless explicitly configured. By default it returns a summary and
 * structured output with field-level redaction.
 *
 * Input:
 *   query:        string  (required) — SQL SELECT query (read-only enforced)
 *   params:       array   (optional) — parameterized query values
 *   limit:        number  (optional, default: 100, max: 1000) — row limit
 *   output_mode:  string  (optional) — "summary" | "structured" | "count_only"
 *   redact_fields: string[] (optional) — field names to redact in output
 *
 * Policy example:
 *   { "id": "prod-db-approval", "capability": "db.read",
 *     "condition": { "eq": ["constraints.environment", "production"] },
 *     "action": "require_approval" }
 *
 * Configure:
 *   MAP_DB_CONNECTION_STRING=postgresql://user:pass@host:5432/dbname
 *
 * Without a connection string, runs in simulation mode.
 */

import type {
  ExecutionAdapter,
  ExecutionContext,
  ExecutionResult,
  ValidationResult,
} from "../core/types.js";

const BLOCKED_SQL_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /--/,
  /;.*\S/,  // multiple statements
];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export type DbOutputMode = "summary" | "structured" | "count_only";

export interface DbReadAdapterOptions {
  /**
   * PostgreSQL connection string.
   * Default: uses MAP_DB_CONNECTION_STRING env var.
   * If neither is set, runs in simulation mode.
   */
  connectionString?: string;
  /**
   * Maximum rows to return regardless of input limit.
   */
  maxRows?: number;
  /**
   * Default output mode.
   */
  defaultOutputMode?: DbOutputMode;
  /**
   * Fields to always redact regardless of input.
   */
  alwaysRedactFields?: string[];
}

export class DbReadAdapter implements ExecutionAdapter {
  readonly capability = "db.read";

  private readonly connectionString?: string;
  private readonly maxRows: number;
  private readonly defaultOutputMode: DbOutputMode;
  private readonly alwaysRedactFields: Set<string>;
  private readonly simulate: boolean;

  constructor(options: DbReadAdapterOptions = {}) {
    this.connectionString =
      options.connectionString ?? process.env.MAP_DB_CONNECTION_STRING;
    this.maxRows = options.maxRows ?? MAX_LIMIT;
    this.defaultOutputMode = options.defaultOutputMode ?? "structured";
    this.alwaysRedactFields = new Set(
      (options.alwaysRedactFields ?? [
        "password",
        "password_hash",
        "secret",
        "token",
        "api_key",
        "ssn",
        "credit_card",
        "card_number",
      ]).map((f) => f.toLowerCase()),
    );
    this.simulate = !this.connectionString;
  }

  validate(input: unknown): ValidationResult {
    if (!input || typeof input !== "object") {
      return { valid: false, errors: [{ field: "input", message: "Input must be an object." }] };
    }
    const inp = input as Record<string, unknown>;
    const errors: Array<{ field: string; message: string }> = [];

    if (typeof inp.query !== "string" || inp.query.trim().length === 0) {
      errors.push({ field: "query", message: "query is required and must be a non-empty string." });
    } else {
      const query = inp.query.trim();
      for (const pattern of BLOCKED_SQL_PATTERNS) {
        if (pattern.test(query)) {
          errors.push({
            field: "query",
            message: "Only SELECT queries are allowed. Write operations are blocked.",
          });
          break;
        }
      }
      if (!query.toUpperCase().trimStart().startsWith("SELECT") &&
          !query.toUpperCase().trimStart().startsWith("WITH")) {
        errors.push({
          field: "query",
          message: "Query must start with SELECT or WITH.",
        });
      }
    }

    if (inp.params !== undefined && !Array.isArray(inp.params)) {
      errors.push({ field: "params", message: "params must be an array." });
    }

    if (inp.limit !== undefined) {
      if (typeof inp.limit !== "number" || inp.limit <= 0 || !Number.isInteger(inp.limit)) {
        errors.push({ field: "limit", message: "limit must be a positive integer." });
      } else if (inp.limit > this.maxRows) {
        errors.push({ field: "limit", message: `limit cannot exceed ${this.maxRows}.` });
      }
    }

    if (inp.output_mode !== undefined &&
        !["summary", "structured", "count_only"].includes(inp.output_mode as string)) {
      errors.push({ field: "output_mode", message: 'output_mode must be "summary", "structured", or "count_only".' });
    }

    return { valid: errors.length === 0, errors };
  }

  async execute(
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const query = (input.query as string).trim();
    const params = (input.params as unknown[] | undefined) ?? [];
    const limit = Math.min(
      typeof input.limit === "number" ? input.limit : DEFAULT_LIMIT,
      this.maxRows,
    );
    const outputMode = (input.output_mode as DbOutputMode | undefined) ?? this.defaultOutputMode;
    const redactFields = new Set([
      ...this.alwaysRedactFields,
      ...((input.redact_fields as string[] | undefined) ?? []).map((f) => f.toLowerCase()),
    ]);

    const startedAt = Date.now();

    let rows: Record<string, unknown>[];
    let rowCount: number;

    if (this.simulate) {
      const result = this.simulateQuery(query, params, limit);
      rows = result.rows;
      rowCount = result.rowCount;
    } else {
      const result = await this.executeQuery(query, params, limit);
      rows = result.rows;
      rowCount = result.rowCount;
    }

    const durationMs = Date.now() - startedAt;

    // Apply redaction
    const redactedRows = rows.map((row) => this.redactRow(row, redactFields));

    // Build output based on mode
    let output: Record<string, unknown>;
    switch (outputMode) {
      case "count_only":
        output = { count: rowCount, duration_ms: durationMs, simulated: this.simulate };
        break;
      case "summary":
        output = {
          count: rowCount,
          columns: redactedRows.length > 0 ? Object.keys(redactedRows[0]) : [],
          sample: redactedRows.slice(0, 3),
          duration_ms: durationMs,
          simulated: this.simulate,
        };
        break;
      case "structured":
      default:
        output = {
          count: rowCount,
          rows: redactedRows,
          duration_ms: durationMs,
          simulated: this.simulate,
        };
    }

    return {
      intent_id: context.intent_id,
      capability: this.capability,
      status: "ok",
      output,
      summary: `Query returned ${rowCount} row${rowCount !== 1 ? "s" : ""} in ${durationMs}ms`,
    };
  }

  private redactRow(
    row: Record<string, unknown>,
    redactFields: Set<string>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      result[key] = redactFields.has(key.toLowerCase()) ? "[REDACTED]" : value;
    }
    return result;
  }

  private simulateQuery(
    query: string,
    _params: unknown[],
    limit: number,
  ): { rows: Record<string, unknown>[]; rowCount: number } {
    // Generate realistic-looking simulated data based on query shape
    const tableName = this.extractTableName(query);
    const count = Math.min(Math.floor(Math.random() * 10) + 1, limit);
    const rows = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      [`${tableName}_name`]: `${tableName}_record_${i + 1}`,
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      status: ["active", "pending", "completed"][i % 3],
    }));
    return { rows, rowCount: count };
  }

  private extractTableName(query: string): string {
    const match = query.match(/FROM\s+["']?(\w+)["']?/i);
    return match?.[1] ?? "record";
  }

  private async executeQuery(
    query: string,
    params: unknown[],
    limit: number,
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    // Add LIMIT clause if not present
    const limitedQuery = /\bLIMIT\b/i.test(query)
      ? query
      : `${query} LIMIT ${limit}`;

    // Dynamic import of pg to avoid hard dependency
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pg = await import("pg" as any);
      const Client = pg.default?.Client ?? pg.Client;
      const client = new Client({ connectionString: this.connectionString });
      await client.connect();
      try {
        const result = await client.query(limitedQuery, params);
        return {
          rows: result.rows as Record<string, unknown>[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      } finally {
        await client.end();
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Cannot find module")) {
        throw new Error(
          "PostgreSQL adapter requires the 'pg' package. Run: npm install pg @types/pg",
        );
      }
      throw err;
    }
  }
}
