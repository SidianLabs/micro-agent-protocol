/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Intent,
  PolicyAction,
  PolicyDecision,
  PolicyDocument,
  PolicyCondition,
  PolicyRule,
  ComparisonCondition,
  LogicalAndCondition,
  LogicalOrCondition,
  LogicalNotCondition,
  AlwaysCondition,
  NeverCondition,
  FieldRef,
} from "../types.js";

// ─── Compiled Policy Types ───────────────────────────────────────────────────

interface CompiledCapabilityMatcher {
  /** Fast-path: exact string match (no glob). null if glob is used. */
  exact: string | null;
  /** Fast-path: wildcard-only ("*"). */
  matchAll: boolean;
  /** Pre-compiled RegExp for glob patterns. null if exact or matchAll. */
  regex: RegExp | null;
}

interface CompiledCondition {
  evaluate: (intent: Intent) => boolean;
}

interface CompiledRule {
  id: string;
  action: PolicyAction;
  capabilityMatcher: CompiledCapabilityMatcher;
  condition: CompiledCondition;
}

export interface CompiledPolicy {
  rules: CompiledRule[];
  defaultAction: PolicyAction;
  /** The original PolicyDocument reference (for identity-based cache lookup). */
  _source: PolicyDocument;
}

// ─── Compilation Cache ───────────────────────────────────────────────────────

const compilationCache = new WeakMap<PolicyDocument, CompiledPolicy>();

/**
 * Compile a PolicyDocument into an optimized form.
 * Pre-compiles RegExp patterns and pre-splits field paths.
 * Results are memoized by reference.
 */
export function compilePolicy(policy: PolicyDocument): CompiledPolicy {
  const cached = compilationCache.get(policy);
  if (cached) return cached;

  const compiled: CompiledPolicy = {
    rules: policy.rules.map(compileRule),
    defaultAction: policy.default_action ?? "deny",
    _source: policy,
  };

  compilationCache.set(policy, compiled);
  return compiled;
}

function compileRule(rule: PolicyRule): CompiledRule {
  return {
    id: rule.id,
    action: rule.action,
    capabilityMatcher: compileCapabilityMatcher(rule.capability),
    condition: compileCondition(rule.condition),
  };
}

function compileCapabilityMatcher(capability: string): CompiledCapabilityMatcher {
  if (capability === "*") {
    return { exact: null, matchAll: true, regex: null };
  }
  if (!capability.includes("*")) {
    return { exact: capability, matchAll: false, regex: null };
  }
  // Glob pattern — pre-compile the RegExp
  const pattern = capability.replace(/\./g, "\\.").replace(/\*/g, ".*");
  return { exact: null, matchAll: false, regex: new RegExp(`^${pattern}$`) };
}

function compileCondition(condition: PolicyCondition): CompiledCondition {
  if (isAlwaysCondition(condition)) {
    return { evaluate: () => true };
  }

  if (isNeverCondition(condition)) {
    return { evaluate: () => false };
  }

  if (isComparisonCondition(condition)) {
    const op = Object.keys(condition)[0] as string;
    const [leftPath, rightValue] = condition[op];
    // Pre-split the field path
    const parts = (leftPath as string).split(".");
    return {
      evaluate: (intent: Intent) => {
        const leftValue = getFieldValueFromParts(parts, intent);
        return evaluateOp(op, leftValue, rightValue);
      },
    };
  }

  if (isLogicalAndCondition(condition)) {
    const compiled = condition.and.map(compileCondition);
    return {
      evaluate: (intent: Intent) => compiled.every((c) => c.evaluate(intent)),
    };
  }

  if (isLogicalOrCondition(condition)) {
    const compiled = condition.or.map(compileCondition);
    return {
      evaluate: (intent: Intent) => compiled.some((c) => c.evaluate(intent)),
    };
  }

  if (isLogicalNotCondition(condition)) {
    const compiled = compileCondition(condition.not);
    return {
      evaluate: (intent: Intent) => !compiled.evaluate(intent),
    };
  }

  if (isFieldRef(condition)) {
    const parts = condition.$field.split(".");
    return {
      evaluate: (intent: Intent) => Boolean(getFieldValueFromParts(parts, intent)),
    };
  }

  return { evaluate: () => false };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate an intent against a policy.
 * Accepts either a raw PolicyDocument (compiled on first use and memoized)
 * or a pre-compiled CompiledPolicy.
 */
export function evaluate(intent: Intent, policy: PolicyDocument | CompiledPolicy): PolicyDecision {
  const compiled = isCompiledPolicy(policy) ? policy : compilePolicy(policy);
  return evaluateCompiled(intent, compiled);
}

function isCompiledPolicy(p: PolicyDocument | CompiledPolicy): p is CompiledPolicy {
  return "_source" in p;
}

function evaluateCompiled(intent: Intent, compiled: CompiledPolicy): PolicyDecision {
  for (const rule of compiled.rules) {
    if (!matchesCapabilityCompiled(intent.capability, rule.capabilityMatcher)) {
      continue;
    }

    if (rule.condition.evaluate(intent)) {
      return {
        action: rule.action,
        reason: `Rule matched: ${rule.id}`,
        matched_rule: rule.id,
      };
    }
  }

  return {
    action: compiled.defaultAction,
    reason: compiled.defaultAction === "allow"
      ? "Default allow - no rules matched"
      : "Default deny - no rules matched",
    matched_rule: undefined,
  };
}

function matchesCapabilityCompiled(
  intentCapability: string,
  matcher: CompiledCapabilityMatcher,
): boolean {
  if (matcher.matchAll) return true;
  if (matcher.exact !== null) return matcher.exact === intentCapability;
  return matcher.regex!.test(intentCapability);
}

// ─── Condition evaluation helpers ────────────────────────────────────────────

function evaluateOp(op: string, leftValue: unknown, rightValue: unknown): boolean {
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

function getFieldValueFromParts(parts: string[], intent: Intent): unknown {
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

// ─── Legacy uncompiled path (kept for backward compat with direct condition checks) ──

function getFieldValue(path: string, intent: Intent): unknown {
  return getFieldValueFromParts(path.split("."), intent);
}

// ─── Type guards ─────────────────────────────────────────────────────────────

function isComparisonCondition(obj: PolicyCondition): obj is ComparisonCondition {
  if (typeof obj !== "object" || obj === null) return false;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return false;
  const key = keys[0];
  return ["eq", "neq", "gt", "gte", "lt", "lte", "in"].includes(key);
}

function isAlwaysCondition(obj: PolicyCondition): obj is AlwaysCondition {
  return "always" in obj && (obj as AlwaysCondition).always === true;
}

function isNeverCondition(obj: PolicyCondition): obj is NeverCondition {
  return "never" in obj && (obj as NeverCondition).never === true;
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
