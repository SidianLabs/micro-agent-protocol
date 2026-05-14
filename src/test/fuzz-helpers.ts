/**
 * MAP Protocol - Fuzz Test Helpers
 *
 * Utility functions for generating random valid test data
 * for property-based and fuzz testing.
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import type {
  DispatchRequest,
  TaskEnvelope,
  RequesterIdentity,
  TaskConstraints,
  RiskLevel,
  VisibilityMode,
} from "../types.js";

// ── Character Sets ──────────────────────────────────────────────────────────

const ALPHA = "abcdefghijklmnopqrstuvwxyz";
const ALPHA_NUM = ALPHA + "0123456789";
const UNICODE_CHARS = [
  "🎉", "🔥", "🚀", "💡", "⭐", "🧪", "🤖", "✨", "💻", "🔒",
  "é", "ñ", "ü", "ç", "ß", "ø", "å", "Ω", "∑", "π",
  "中文", "日本語", "한국어", "العربية", "עברית", "😀", "👍", "🏆",
];
const ALL_PRINTABLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:',.<>?/`~ ";

// ── Random Generators ───────────────────────────────────────────────────────

/**
 * Generate a random string of given length using alphanumeric characters.
 */
export function randomString(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHA_NUM.charAt(Math.floor(Math.random() * ALPHA_NUM.length));
  }
  return result;
}

/**
 * Generate a random string that may contain unicode characters.
 */
export function randomUnicodeString(minLength: number, maxLength: number): string {
  const length = minLength + Math.floor(Math.random() * (maxLength - minLength + 1));
  let result = "";
  for (let i = 0; i < length; i++) {
    if (Math.random() < 0.3) {
      result += UNICODE_CHARS[Math.floor(Math.random() * UNICODE_CHARS.length)];
    } else {
      result += ALL_PRINTABLE.charAt(Math.floor(Math.random() * ALL_PRINTABLE.length));
    }
  }
  return result;
}

/**
 * Pick a random element from an array.
 */
export function randomChoice<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate a random integer between min and max (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Generate a random boolean.
 */
export function randomBool(): boolean {
  return Math.random() < 0.5;
}

/**
 * Generate a random ISO timestamp.
 */
export function randomTimestamp(): string {
  const now = Date.now();
  const offset = randomInt(-365 * 24 * 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000);
  return new Date(now + offset).toISOString();
}

/**
 * Generate a large payload string (for testing size limits).
 */
export function largePayload(sizeBytes: number): string {
  const chars: string[] = [];
  for (let i = 0; i < sizeBytes; i++) {
    chars.push(ALPHA_NUM.charAt(i % ALPHA_NUM.length));
  }
  return chars.join("");
}

// ── Domain-Specific Generators ──────────────────────────────────────────────

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];
const VISIBILITY_MODES: VisibilityMode[] = [
  "full",
  "summary",
  "structured_only",
  "receipt_only",
  "redacted",
  "debug",
];
const IDENTITY_TYPES: RequesterIdentity["type"][] = ["user", "service", "agent"];
const ENVIRONMENTS: Array<"development" | "staging" | "production"> = [
  "development",
  "staging",
  "production",
];
const CAPABILITIES = [
  "db.read.aggregate",
  "db.write.update",
  "payment.execute",
  "audit.export",
  "notification.send",
  "report.generate",
];
const AGENT_IDS = [
  "dbread-agent-v1",
  "payment-agent-v1",
  "dbwrite-agent-v1",
  "notification-agent-v1",
  "audit-agent-v1",
];

/**
 * Generate a random requester identity.
 */
export function randomRequesterIdentity(): RequesterIdentity {
  return {
    type: randomChoice(IDENTITY_TYPES),
    id: `user_${randomString(6)}`,
    tenant_id: randomChoice(["tenant_A", "tenant_B", "tenant_C"]),
  };
}

/**
 * Generate random task constraints.
 */
export function randomConstraints(depth = 0): TaskConstraints {
  const constraints: TaskConstraints = {};

  if (randomBool()) {
    constraints.common = {
      environment: randomChoice(ENVIRONMENTS),
      max_amount: randomBool() ? randomInt(0, 999999) : undefined,
      currency: randomChoice(["USD", "EUR", "INR", "GBP"]),
      redaction_level: randomChoice(["none", "basic", "strict"]),
      resource_id: `res_${randomString(8)}`,
    };
  }

  if (randomBool()) {
    constraints.domain = {
      dataset: `ds_${randomString(5)}`,
      service: randomChoice(["payments", "metrics", "inventory", "users"]),
    };
  }

  // Recursively add nested constraints
  if (depth < 10 && randomBool()) {
    constraints[`nested_${depth}`] = randomConstraints(depth + 1);
  }

  return constraints;
}

/**
 * Generate deeply nested constraints (exactly `depth` levels).
 */
export function deeplyNestedConstraints(depth: number): TaskConstraints {
  if (depth <= 0) {
    return {
      common: { environment: "staging" },
      domain: { key: `leaf_${randomString(4)}` },
    };
  }

  return {
    common: { environment: "staging" },
    domain: { key: `level_${depth}` },
    [`nested_${depth}`]: deeplyNestedConstraints(depth - 1),
  };
}

/**
 * Generate a random task envelope.
 */
export function randomTaskEnvelope(overrides?: Partial<TaskEnvelope>): TaskEnvelope {
  return {
    task_id: overrides?.task_id ?? `task_${randomUUID()}`,
    requester_identity: overrides?.requester_identity ?? randomRequesterIdentity(),
    target_agent: overrides?.target_agent ?? randomChoice(AGENT_IDS),
    intent: overrides?.intent ?? `Test intent: ${randomString(20)}`,
    constraints: overrides?.constraints ?? randomConstraints(),
    risk_class: overrides?.risk_class ?? randomChoice(RISK_LEVELS),
    delegation_token: overrides?.delegation_token ?? `token_${randomString(12)}`,
    requested_output_mode: overrides?.requested_output_mode ?? randomChoice(VISIBILITY_MODES),
    ...(overrides?.deadline !== undefined ? { deadline: overrides.deadline } : {}),
    ...(overrides?.parent_task_id !== undefined
      ? { parent_task_id: overrides.parent_task_id }
      : {}),
    ...(overrides?.metadata !== undefined ? { metadata: overrides.metadata } : {}),
    ...(overrides?.idempotency_token !== undefined
      ? { idempotency_token: overrides.idempotency_token }
      : {}),
  };
}

/**
 * Generate a random dispatch request.
 */
export function randomDispatchRequest(
  overrides?: Partial<DispatchRequest>
): DispatchRequest {
  return {
    capability: overrides?.capability ?? randomChoice(CAPABILITIES),
    envelope: overrides?.envelope ?? randomTaskEnvelope(),
    ...(overrides?.requested_schema_version !== undefined
      ? { requested_schema_version: overrides.requested_schema_version }
      : {}),
    ...(overrides?.negotiation !== undefined
      ? { negotiation: overrides.negotiation }
      : {}),
  };
}
