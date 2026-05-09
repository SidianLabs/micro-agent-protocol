import { AsyncTaskQueue } from "./control-plane/async-queue.js";
import { AgentRegistry } from "./control-plane/registry.js";
import { DelegationService } from "./control-plane/delegation.js";
import { OrchestratorRuntime } from "./control-plane/orchestrator.js";
import { DefaultPolicyEngine } from "./control-plane/policy.js";
import { ReceiptStore } from "./control-plane/receipt-store.js";
import { TaskStore } from "./control-plane/task-store.js";
import type { MicroAgent } from "./runtime/micro-agent.js";
import { createExampleAgents } from "./runtime/example-agents.js";

export interface ReferenceAppOptions {
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
  agents?: MicroAgent[];
  includeExampleAgents?: boolean;
}

export function createReferenceApp(options: ReferenceAppOptions = {}) {
  const registry = new AgentRegistry();
  const policyEngine = new DefaultPolicyEngine({ requireTenant: options.requireTenant });
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
    maxDeadLetters: options.asyncQueueMaxDeadLetters
  });
  const taskStore = new TaskStore({
    filePath: options.taskStorePath,
    dbPath: options.taskStoreDbPath
  });
  const receiptStore = new ReceiptStore({
    filePath: options.receiptStorePath,
    dbPath: options.receiptStoreDbPath
  });
  const agents = [
    ...(options.agents ?? []),
    ...(options.includeExampleAgents ? createExampleAgents() : [])
  ];

  for (const agent of agents) {
    registry.register(agent.descriptor);
  }

  const runtimes = new Map<string, MicroAgent>(
    agents.map((agent) => [agent.descriptor.agent_id, agent])
  );
  const orchestrator = new OrchestratorRuntime(
    registry,
    policyEngine,
    delegationService,
    runtimes,
    taskStore,
    receiptStore,
    asyncQueue
  );

  return {
    registry,
    policyEngine,
    delegationService,
    taskStore,
    receiptStore,
    asyncQueue,
    orchestrator,
    runtimes
  };
}
