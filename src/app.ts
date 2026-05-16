import { readFileSync, existsSync } from "node:fs";
import { AsyncTaskQueue } from "./control-plane/async-queue.js";
import { AgentRegistry } from "./control-plane/registry.js";
import { DelegationService } from "./control-plane/delegation.js";
import { OrchestratorRuntime } from "./control-plane/orchestrator.js";
import { ReceiptStore } from "./control-plane/receipt-store.js";
import { TaskStore } from "./control-plane/task-store.js";
import { Executor } from "./core/index.js";
import type { ExecutionAdapter, PolicyDocument } from "./core/index.js";
import {
  DbReadAdapter,
  PaymentExecuteAdapter,
  PaymentRefundAdapter,
} from "./adapters/index.js";
import type { AgentDescriptor } from "./types.js";

export interface SystemOptions {
  taskStorePath?: string;
  taskStoreDbPath?: string;
  receiptStorePath?: string;
  receiptStoreDbPath?: string;
  requireTenant?: boolean;
  asyncQueueMaxAttempts?: number;
  asyncQueueRetryDelayMs?: number;
  asyncQueueMaxRetryDelayMs?: number;
  asyncQueueRetryJitterRatio?: number;
  asyncQueueMaxConcurrent?: number;
  asyncQueueMaxConcurrentPerTenant?: number;
  asyncQueueMaxQueueDepth?: number;
  deadLetterStorePath?: string;
  asyncQueueMaxDeadLetters?: number;
  /** Policy document. If policyFilePath is set and the file exists, it takes precedence. */
  policy: PolicyDocument;
  /** Path to a JSON file containing the policy document. Loaded at startup. */
  policyFilePath?: string;
  adapters: Map<string, ExecutionAdapter>;
  agents?: AgentDescriptor[];
  /** Default webhook URL for approval notifications. */
  approvalWebhookUrl?: string;
  /** Base URL of this MAP server (used in approval notification payloads). */
  serverBaseUrl?: string;
}

export function createSystem(options: SystemOptions) {
  // Load policy: file takes precedence over inline if it exists
  let activePolicy = options.policy;
  if (options.policyFilePath && existsSync(options.policyFilePath)) {
    try {
      const raw = readFileSync(options.policyFilePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === "1.0" && Array.isArray(parsed.rules)) {
        activePolicy = parsed as PolicyDocument;
        console.log(
          `[MAP] Loaded policy from ${options.policyFilePath} (${activePolicy.rules.length} rules)`,
        );
      } else {
        console.warn(
          `[MAP] Policy file ${options.policyFilePath} has invalid format, using inline policy.`,
        );
      }
    } catch (err) {
      console.warn(
        `[MAP] Failed to load policy from ${options.policyFilePath}:`,
        err,
      );
    }
  }

  const registry = new AgentRegistry();
  const delegationService = new DelegationService();
  const asyncQueue = new AsyncTaskQueue({
    maxAttempts: options.asyncQueueMaxAttempts,
    retryDelayMs: options.asyncQueueRetryDelayMs,
    maxRetryDelayMs: options.asyncQueueMaxRetryDelayMs,
    retryJitterRatio: options.asyncQueueRetryJitterRatio,
    maxConcurrent: options.asyncQueueMaxConcurrent,
    maxConcurrentPerTenant: options.asyncQueueMaxConcurrentPerTenant,
    maxQueueDepth: options.asyncQueueMaxQueueDepth,
    deadLetterStorePath: options.deadLetterStorePath,
    maxDeadLetters: options.asyncQueueMaxDeadLetters,
  });
  const taskStore = new TaskStore({
    filePath: options.taskStorePath,
    dbPath: options.taskStoreDbPath,
  });
  const receiptStore = new ReceiptStore({
    filePath: options.receiptStorePath,
    dbPath: options.receiptStoreDbPath,
  });

  for (const agent of options.agents ?? []) {
    registry.register(agent);
  }

  const coreExecutor = new Executor({
    policy: activePolicy,
    adapters: options.adapters,
  });

  const orchestrator = new OrchestratorRuntime(
    registry,
    delegationService,
    taskStore,
    receiptStore,
    asyncQueue,
    coreExecutor,
    activePolicy,
    {
      defaultWebhookUrl: options.approvalWebhookUrl,
      serverBaseUrl: options.serverBaseUrl,
    },
  );

  return {
    registry,
    delegationService,
    taskStore,
    receiptStore,
    asyncQueue,
    orchestrator,
    coreExecutor,
  };
}

export function createReferenceApp(options: Omit<SystemOptions, "policy" | "adapters"> & { policy?: PolicyDocument; adapters?: Map<string, ExecutionAdapter> }) {
  const defaultPolicy: PolicyDocument = options.policy ?? {
    version: "1.0",
    rules: [
      {
        id: "high-value-payment",
        capability: "payment.*",
        condition: { gt: ["input.amount", 1000] },
        action: "require_approval",
      },
      {
        id: "production-db-read-approval",
        capability: "db.read.*",
        condition: { eq: ["constraints.environment", "production"] },
        action: "require_approval",
      },
      {
        id: "critical-risk-approval",
        capability: "*",
        condition: { eq: ["risk_class", "critical"] },
        action: "require_approval",
      },
    ],
  };
  const defaultAdapters = options.adapters ?? createDefaultAdapters();

  return createSystem({
    ...options,
    policy: defaultPolicy,
    adapters: defaultAdapters,
  });
}

function createDefaultAdapters(): Map<string, ExecutionAdapter> {
  const dbReadAdapter = new DbReadAdapter({
    defaultOutputMode: "summary",
  });
  const paymentExecuteAdapter = new PaymentExecuteAdapter({ simulate: true });
  const paymentRefundAdapter = new PaymentRefundAdapter({ simulate: true });

  return new Map<string, ExecutionAdapter>([
    ["db.read.query", dbReadAdapter],
    ["db.read.lookup", dbReadAdapter],
    ["db.read.aggregate", dbReadAdapter],
    ["payment.execute", paymentExecuteAdapter],
    ["payment.refund", paymentRefundAdapter],
  ]);
}
