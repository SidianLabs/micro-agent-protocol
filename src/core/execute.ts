import { randomUUID } from "node:crypto";

import type {
  Intent,
  ExecutionResult,
  ExecutionReceipt,
  PolicyDocument,
  ExecutionAdapter,
} from "./types.js";

export interface ExecuteOptions {
  intent: Intent;
  policy: PolicyDocument;
  adapters?: Map<string, ExecutionAdapter>;
  signReceipt?: (receipt: Omit<ExecutionReceipt, "signature">) => string;
  onDecision?: (decision: { action: "allow" | "deny" | "require_approval"; reason?: string }) => void;
}

export async function execute(options: ExecuteOptions): Promise<ExecutionResult | ExecutionReceipt> {
  const { intent, policy, onDecision } = options;

  const normalizedIntent: Intent = {
    ...intent,
    capability: intent.capability.toLowerCase().trim(),
    requester: {
      ...intent.requester,
      id: intent.requester.id.trim(),
      tenant_id: intent.requester.tenant_id?.trim(),
    },
    risk_class: intent.risk_class?.toLowerCase() as Intent["risk_class"],
  };

  const decision = evaluatePolicy(normalizedIntent, policy);

  if (onDecision) {
    onDecision(decision);
  }

  if (decision.action === "deny") {
    return buildReceipt(normalizedIntent, "denied", "error");
  }

  if (decision.action === "require_approval") {
    return buildReceipt(normalizedIntent, "approval_required", "error");
  }

  const adapter = options.adapters?.get(normalizedIntent.capability);
  if (!adapter) {
    return buildReceipt(normalizedIntent, "denied", "error");
  }

  const adapterValidation = adapter.validate(normalizedIntent.input);
  if (!adapterValidation.valid) {
    return buildReceipt(normalizedIntent, "denied", "error");
  }

  const result = await adapter.execute(normalizedIntent.input, {
    intent_id: normalizedIntent.metadata?.intent_id || generateId(),
    requester: normalizedIntent.requester,
  });

  return result;
}

function evaluatePolicy(intent: Intent, policy: PolicyDocument): { action: "allow" | "deny" | "require_approval"; reason?: string } {
  for (const rule of policy.rules) {
    if (!matchesCapability(intent.capability, rule.capability)) {
      continue;
    }

    const conditionResult = evaluateCondition(rule.condition, intent);

    if (conditionResult === true) {
      return {
        action: rule.action,
        reason: `Rule: ${rule.id}`,
      };
    }
  }

  return {
    action: "allow",
    reason: "Default allow",
  };
}

function matchesCapability(intentCapability: string, ruleCapability: string): boolean {
  if (ruleCapability === "*") return true;
  if (ruleCapability === intentCapability) return true;
  if (ruleCapability.includes("*")) {
    const pattern = ruleCapability.replace(/\./g, "\\.").replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(intentCapability);
  }
  return false;
}

function evaluateCondition(condition: unknown, intent: Intent): boolean {
  if (!condition || typeof condition !== "object") return false;

  if ("$field" in condition) {
    return Boolean(getFieldValue((condition as { $field: string }).$field, intent));
  }

  if ("and" in condition) {
    return (condition as { and: unknown[] }).and.every((c) => evaluateCondition(c, intent));
  }

  if ("or" in condition) {
    return (condition as { or: unknown[] }).or.some((c) => evaluateCondition(c, intent));
  }

  if ("not" in condition) {
    return !evaluateCondition((condition as { not: unknown }).not, intent);
  }

  const ops = ["eq", "neq", "gt", "gte", "lt", "lte", "in"] as const;
  for (const op of ops) {
    if (op in condition) {
      const [leftPath, rightValue] = (condition as Record<string, [string, unknown]>)[op];
      const leftValue = getFieldValue(leftPath, intent);

      switch (op) {
        case "eq": return leftValue === rightValue;
        case "neq": return leftValue !== rightValue;
        case "gt": return typeof leftValue === "number" && typeof rightValue === "number" && leftValue > rightValue;
        case "gte": return typeof leftValue === "number" && typeof rightValue === "number" && leftValue >= rightValue;
        case "lt": return typeof leftValue === "number" && typeof rightValue === "number" && leftValue < rightValue;
        case "lte": return typeof leftValue === "number" && typeof rightValue === "number" && leftValue <= rightValue;
        case "in": return Array.isArray(rightValue) && rightValue.includes(leftValue);
      }
    }
  }

  return false;
}

function getFieldValue(path: string, intent: Intent): unknown {
  const parts = path.split(".");
  let current: unknown = intent;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function buildReceipt(
  intent: Intent,
  action: "executed" | "denied" | "approval_required",
  status: "ok" | "error"
): ExecutionReceipt {
  const intentId = intent.metadata?.intent_id || generateId();
  return {
    receipt_id: `receipt:${intentId}:${Date.now()}`,
    intent_id: intentId,
    capability: intent.capability,
    action,
    timestamp: new Date().toISOString(),
    status,
  };
}

function generateId(): string {
  return randomUUID();
}
