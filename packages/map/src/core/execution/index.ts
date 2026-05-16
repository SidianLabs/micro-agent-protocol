import { randomUUID } from "node:crypto";

import type {
  Intent,
  ExecutionAdapter,
  ExecutionContext,
  ExecutionResult,
  ExecutionReceipt,
  PolicyDocument,
} from "../types.js";
import { validate as validateIntent, normalize as normalizeIntent } from "../intent/index.js";
import { evaluate as evaluatePolicy } from "../policy/index.js";

export interface ExecutorOptions {
  policy: PolicyDocument;
  adapters: Map<string, ExecutionAdapter>;
  signReceipt?: (receipt: Omit<ExecutionReceipt, "signature">) => string;
}

export class Executor {
  private policy: PolicyDocument;
  private adapters: Map<string, ExecutionAdapter>;
  private signReceipt?: (receipt: Omit<ExecutionReceipt, "signature">) => string;

  constructor(options: ExecutorOptions) {
    this.policy = options.policy;
    this.adapters = options.adapters;
    this.signReceipt = options.signReceipt;
  }

  async execute(intent: Intent): Promise<ExecutionResult | ExecutionReceipt> {
    const validation = validateIntent(intent);
    if (!validation.valid) {
      throw new Error(`Invalid intent: ${validation.errors.map((e) => e.message).join(", ")}`);
    }

    const normalizedIntent = normalizeIntent(intent);

    const decision = evaluatePolicy(normalizedIntent, this.policy);

    if (decision.action === "deny") {
      return this.buildReceipt(normalizedIntent, "denied", "error");
    }

    if (decision.action === "require_approval") {
      return this.buildReceipt(normalizedIntent, "approval_required", "error");
    }

    return this.executeNormalizedIntent(normalizedIntent);
  }

  async executeApproved(intent: Intent): Promise<ExecutionResult> {
    const validation = validateIntent(intent);
    if (!validation.valid) {
      throw new Error(`Invalid intent: ${validation.errors.map((e) => e.message).join(", ")}`);
    }

    const normalizedIntent = normalizeIntent(intent);
    return this.executeNormalizedIntent(normalizedIntent);
  }

  setPolicy(policy: PolicyDocument): void {
    this.policy = policy;
  }

  private async executeNormalizedIntent(intent: Intent): Promise<ExecutionResult> {
    const adapter = this.adapters.get(intent.capability);
    if (!adapter) {
      throw new Error(`No adapter for capability: ${intent.capability}`);
    }

    const adapterValidation = adapter.validate(intent.input);
    if (!adapterValidation.valid) {
      throw new Error(`Invalid input: ${adapterValidation.errors.map((e) => e.message).join(", ")}`);
    }

    const context: ExecutionContext = {
      intent_id: intent.metadata?.intent_id || generateId(),
      requester: intent.requester,
    };

    const result = await adapter.execute(intent.input, context);
    return result;
  }

  private buildReceipt(
    intent: Intent,
    action: ExecutionReceipt["action"],
    status: ExecutionReceipt["status"]
  ): ExecutionReceipt {
    const intentId = intent.metadata?.intent_id || generateId();
    const receipt: Omit<ExecutionReceipt, "signature"> = {
      receipt_id: `receipt:${intentId}:${Date.now()}`,
      intent_id: intentId,
      capability: intent.capability,
      action,
      timestamp: new Date().toISOString(),
      status,
    };

    return {
      ...receipt,
      signature: this.signReceipt ? this.signReceipt(receipt) : "",
    };
  }
}

function generateId(): string {
  return randomUUID();
}
