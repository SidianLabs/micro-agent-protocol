/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Intent,
  PolicyDecision,
  PolicyDocument,
  PolicyCondition,
  ComparisonCondition,
  LogicalAndCondition,
  LogicalOrCondition,
  LogicalNotCondition,
  FieldRef,
} from "../types.js";

export function evaluate(intent: Intent, policy: PolicyDocument): PolicyDecision {
  for (const rule of policy.rules) {
    if (!matchesCapability(intent.capability, rule.capability)) {
      continue;
    }

    const conditionResult = evaluateCondition(rule.condition, intent);

    if (conditionResult === true) {
      return {
        action: rule.action,
        reason: `Rule matched: ${rule.id}`,
        matched_rule: rule.id,
      };
    }
  }

  return {
    action: "allow",
    reason: "Default allow - no rules matched",
    matched_rule: undefined,
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

function evaluateCondition(condition: PolicyCondition, intent: Intent): boolean {
  if (isComparisonCondition(condition)) {
    return evaluateComparison(condition, intent);
  }

  if (isLogicalAndCondition(condition)) {
    return condition.and.every((c) => evaluateCondition(c, intent));
  }

  if (isLogicalOrCondition(condition)) {
    return condition.or.some((c) => evaluateCondition(c, intent));
  }

  if (isLogicalNotCondition(condition)) {
    return !evaluateCondition(condition.not, intent);
  }

  if (isFieldRef(condition)) {
    return Boolean(getFieldValue(condition.$field, intent));
  }

  return false;
}

function isComparisonCondition(obj: PolicyCondition): obj is ComparisonCondition {
  if (typeof obj !== "object" || obj === null) return false;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return false;
  const key = keys[0];
  return ["eq", "neq", "gt", "gte", "lt", "lte", "in"].includes(key);
}

function isLogicalAndCondition(obj: PolicyCondition): obj is LogicalAndCondition {
  return "and" in obj;
}

function isLogicalOrCondition(obj: PolicyCondition): obj is LogicalOrCondition {
  return "or" in obj;
}

function isLogicalNotCondition(obj: PolicyCondition): obj is LogicalNotCondition {
  return "not" in obj;
}

function isFieldRef(obj: PolicyCondition): obj is FieldRef {
  return "$field" in obj;
}

function evaluateComparison(cond: ComparisonCondition, intent: Intent): boolean {
  const op = Object.keys(cond)[0] as string;
  const [leftPath, rightValue] = cond[op];
  const leftValue = getFieldValue(leftPath as string, intent);

  switch (op) {
    case "eq":
      return leftValue === rightValue;
    case "neq":
      return leftValue !== rightValue;
    case "gt":
      return typeof leftValue === "number" && typeof rightValue === "number" && leftValue > rightValue;
    case "gte":
      return typeof leftValue === "number" && typeof rightValue === "number" && leftValue >= rightValue;
    case "lt":
      return typeof leftValue === "number" && typeof rightValue === "number" && leftValue < rightValue;
    case "lte":
      return typeof leftValue === "number" && typeof rightValue === "number" && leftValue <= rightValue;
    case "in":
      return Array.isArray(rightValue) && rightValue.includes(leftValue);
    default:
      return false;
  }
}

function getFieldValue(path: string, intent: Intent): unknown {
  const parts = path.split(".");
  let current: unknown = intent;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}