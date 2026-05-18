/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Executor } from "./core/execution/index.js";
import { evaluate } from "./core/policy/index.js";
import type {
  ExecutionAdapter,
  ExecutionResult,
  ExecutionReceipt,
  PolicyDocument,
  PolicyRule,
  PolicyCondition,
  Intent,
  RequesterIdentity,
} from "./core/types.js";

// ─── Simple Policy DSL ────────────────────────────────────────────────────────
//
// Instead of writing raw JSON policy rules, you can use the simple DSL:
//
//   { when: 'payment.*', amount_gt: 1000, require: 'approval' }
//
// This compiles down to the full PolicyDocument format internally.

export interface SimpleRule {
  /** Capability glob to match. Examples: 'payment.*', 'db.write', '*' */
  when: string;
  /** Require approval when input.amount > this value */
  amount_gt?: number;
  /** Require approval when input.amount >= this value */
  amount_gte?: number;
  /** Match only this environment */
  env?: "development" | "staging" | "production";
  /** Match only this risk class */
  risk?: "low" | "medium" | "high" | "critical";
  /** Match only this requester type */
  requester_type?: "user" | "service";
  /** What to do when this rule matches */
  require: "allow" | "deny" | "approval";
  /** Human-readable description of this rule */
  description?: string;
}

function compileSimpleRule(rule: SimpleRule, index: number): PolicyRule {
  const conditions: PolicyCondition[] = [];

  if (rule.amount_gt !== undefined) {
    conditions.push({ gt: ["input.amount", rule.amount_gt] });
  }
  if (rule.amount_gte !== undefined) {
    conditions.push({ gte: ["input.amount", rule.amount_gte] });
  }
  if (rule.env !== undefined) {
    conditions.push({ eq: ["constraints.environment", rule.env] });
  }
  if (rule.risk !== undefined) {
    conditions.push({ eq: ["risk_class", rule.risk] });
  }
  if (rule.requester_type !== undefined) {
    conditions.push({ eq: ["requester.type", rule.requester_type] });
  }

  // If no conditions specified, always match (catch-all)
  const condition: PolicyCondition =
    conditions.length === 0
      ? { always: true } // first-class always-true condition
      : conditions.length === 1
        ? conditions[0]
        : { and: conditions };

  const action =
    rule.require === "approval"
      ? ("require_approval" as const)
      : rule.require === "deny"
        ? ("deny" as const)
        : ("allow" as const);

  return {
    id: rule.description
      ? rule.description.toLowerCase().replace(/\s+/g, "-").slice(0, 40)
      : `rule-${index}`,
    capability: rule.when,
    condition,
    action,
  };
}

function compilePolicy(
  rules: SimpleRule[] | PolicyDocument,
  defaultAction?: "allow" | "deny",
): PolicyDocument {
  // Already a full PolicyDocument
  if ("version" in rules && "rules" in rules) {
    return rules as PolicyDocument;
  }
  // Simple DSL array — default_action is "deny" unless caller opts in to "allow"
  // or the rule list contains a catch-all { when: '*', require: 'allow' }
  const simpleRules = rules as SimpleRule[];
  const hasCatchAllAllow = simpleRules.some(
    (r) => r.when === "*" && r.require === "allow",
  );
  const effectiveDefault = defaultAction ?? (hasCatchAllAllow ? "allow" : "deny");
  return {
    version: "1.0",
    rules: simpleRules.map((r, i) => compileSimpleRule(r, i)),
    default_action: effectiveDefault,
  };
}

// ─── Result type ─────────────────────────────────────────────────────────────

export interface MapResult {
  /** What happened: executed, denied, or waiting for approval */
  status: "executed" | "denied" | "approval_required";
  /** The output from the adapter (only present when status is 'executed') */
  output?: Record<string, unknown>;
  /** Human-readable summary */
  summary: string;
  /** Cryptographically signed proof of this decision */
  receipt: {
    id: string;
    capability: string;
    action: string;
    timestamp: string;
    signature?: string;
  };
  /** The policy rule that triggered this decision */
  matched_rule?: string;
  /** The approval reference to use when calling .approve() */
  approval_reference?: string;
}

// ─── MAP instance ─────────────────────────────────────────────────────────────

export interface MapOptions {
  /**
   * Your policy rules. Can be:
   * - Simple DSL: [{ when: 'payment.*', amount_gt: 1000, require: 'approval' }]
   * - Full PolicyDocument: { version: '1.0', rules: [...] }
   * - Path to a JSON file: './policy.json'
   * - Omit for default-deny (safe starting point)
   */
  policy?: SimpleRule[] | PolicyDocument | string;

  /**
   * Default action when no rule matches. Defaults to "deny" (fail-closed).
   * Set to "allow" to opt in to permissive mode (not recommended for production).
   */
  defaultAction?: "allow" | "deny";

  /**
   * Who is making requests. Defaults to { type: 'service', id: 'default' }.
   * Override per-request by passing requester to .run()
   */
  requester?: {
    type: "user" | "service";
    id: string;
    tenant_id?: string;
  };

  /**
   * Called when a task requires approval.
   * Receives the approval notification and should deliver it to a human.
   */
  onApprovalRequired?: (notification: {
    capability: string;
    input_summary: Record<string, unknown>;
    reason: string;
    approval_reference: string;
    approve: () => Promise<MapResult>;
  }) => void | Promise<void>;

  /**
   * Called after every execution (allow, deny, or approval_required).
   * Use for logging, metrics, or audit trail integration.
   */
  onDecision?: (event: {
    capability: string;
    action: "allow" | "deny" | "require_approval";
    reason?: string;
    matched_rule?: string;
    timestamp: string;
  }) => void;
}

export interface MapInstance {
  /**
   * Register a capability handler.
   *
   * @example
   * agent.can('payment.execute', async (input) => {
   *   const charge = await stripe.charges.create({ amount: input.amount });
   *   return { charge_id: charge.id };
   * });
   */
  can(
    capability: string,
    handler: (
      input: Record<string, unknown>,
      context: { intent_id: string; requester: { type: string; id: string } },
    ) => Promise<Record<string, unknown>> | Record<string, unknown>,
  ): MapInstance;

  /**
   * Execute a capability.
   *
   * @example
   * const result = await agent.run('payment.execute', {
   *   amount: 5000,
   *   currency: 'USD',
   *   vendor_id: 'vendor_abc',
   * });
   */
  run(
    capability: string,
    input: Record<string, unknown>,
    options?: {
      requester?: { type: "user" | "service"; id: string; tenant_id?: string };
      risk?: "low" | "medium" | "high" | "critical";
      environment?: "development" | "staging" | "production";
    },
  ): Promise<MapResult>;

  /**
   * Approve a pending task.
   *
   * @example
   * const result = await agent.approve('approval:task_123');
   */
  approve(approvalReference: string): Promise<MapResult>;

  /**
   * Hot-swap the policy at runtime. No restart needed.
   * Accepts a SimpleRule array, a full PolicyDocument, or a path to a JSON file.
   *
   * @example
   * agent.setPolicy([{ when: '*', require: 'deny' }]); // lockdown
   * agent.setPolicy('./policy.json');                   // reload from file
   */
  setPolicy(policy: SimpleRule[] | PolicyDocument | string): void;

  /**
   * Get the current policy document.
   */
  getPolicy(): PolicyDocument;

  /**
   * Check what would happen for a given intent without executing it.
   *
   * @example
   * const check = agent.check('payment.execute', { amount: 5000 });
   * // { action: 'require_approval', reason: 'Rule: high-value-payment' }
   */
  check(
    capability: string,
    input: Record<string, unknown>,
    options?: {
      risk?: "low" | "medium" | "high" | "critical";
      environment?: "development" | "staging" | "production";
    },
  ): { action: "allow" | "deny" | "require_approval"; reason?: string; matched_rule?: string };
}

// ─── Pending approvals store ──────────────────────────────────────────────────

interface PendingApproval {
  intent: Intent;
}

// ─── map() factory ────────────────────────────────────────────────────────────

/**
 * Create a MAP agent instance.
 *
 * @example
 * const agent = map({
 *   policy: [
 *     { when: 'payment.*', amount_gt: 1000, require: 'approval' },
 *     { when: 'db.write',  env: 'production', require: 'deny'    },
 *   ],
 *   onApprovalRequired: async ({ capability, approve }) => {
 *     const ok = await askHuman(`Approve ${capability}?`);
 *     if (ok) await approve();
 *   },
 * });
 *
 * agent.can('payment.execute', async (input) => {
 *   return await stripe.charges.create({ amount: input.amount });
 * });
 *
 * const result = await agent.run('payment.execute', { amount: 5000, currency: 'USD' });
 */
export function map(options: MapOptions = {}): MapInstance {
  // Load policy
  let policyDoc: PolicyDocument;

  if (!options.policy) {
    // Default: deny everything (safe starting point — register explicit allow rules)
    policyDoc = { version: "1.0", rules: [], default_action: options.defaultAction ?? "deny" };
  } else if (typeof options.policy === "string") {
    // File path — load synchronously at startup
    const raw = readFileSync(options.policy, "utf8");
    policyDoc = JSON.parse(raw) as PolicyDocument;
    // Respect defaultAction override if the loaded doc doesn't specify one
    if (policyDoc.default_action === undefined && options.defaultAction) {
      policyDoc.default_action = options.defaultAction;
    }
  } else {
    policyDoc = compilePolicy(options.policy, options.defaultAction);
  }

  const defaultRequester: RequesterIdentity = options.requester ?? {
    type: "service",
    id: "default",
  };

  // Adapter registry
  const adapters = new Map<string, ExecutionAdapter>();

  // Pending approvals (approval_reference → pending intent)
  const pendingApprovals = new Map<string, PendingApproval>();

  // Core executor
  const executor = new Executor({ policy: policyDoc, adapters });

  // ── Internal helpers ────────────────────────────────────────────────────

  function buildIntent(
    capability: string,
    input: Record<string, unknown>,
    runOptions?: {
      requester?: RequesterIdentity;
      risk?: "low" | "medium" | "high" | "critical";
      environment?: "development" | "staging" | "production";
    },
  ): Intent {
    return {
      capability,
      input,
      requester: runOptions?.requester ?? defaultRequester,
      risk_class: runOptions?.risk,
      constraints: runOptions?.environment
        ? { environment: runOptions.environment }
        : undefined,
      metadata: {
        intent_id: randomUUID(),
      },
    };
  }

  function toMapResult(
    raw: ExecutionResult | ExecutionReceipt,
    intent: Intent,
  ): MapResult {
    // ExecutionReceipt (denied or approval_required)
    if ("action" in raw && !("output" in raw)) {
      const receipt = raw as ExecutionReceipt;
      const approvalRef =
        receipt.action === "approval_required"
          ? `approval:${receipt.intent_id}`
          : undefined;

      return {
        status:
          receipt.action === "executed"
            ? "executed"
            : receipt.action === "denied"
              ? "denied"
              : "approval_required",
        summary:
          receipt.action === "approval_required"
            ? `Approval required for ${intent.capability}`
            : `${intent.capability} was ${receipt.action}`,
        receipt: {
          id: receipt.receipt_id,
          capability: receipt.capability,
          action: receipt.action,
          timestamp: receipt.timestamp,
          signature: receipt.signature,
        },
        approval_reference: approvalRef,
      };
    }

    // ExecutionResult (executed)
    const result = raw as ExecutionResult;
    return {
      status: result.status === "ok" ? "executed" : "denied",
      output: result.output,
      summary: result.summary,
      receipt: {
        id: `receipt:${result.intent_id}:${Date.now()}`,
        capability: result.capability,
        action: result.status === "ok" ? "executed" : "denied",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  const instance: MapInstance = {
    can(capability, handler) {
      const adapter: ExecutionAdapter = {
        capability,
        validate: () => ({ valid: true, errors: [] }),
        async execute(input, context) {
          const output = await handler(input, context);
          return {
            intent_id: context.intent_id,
            capability,
            status: "ok" as const,
            output: output ?? {},
            summary: `${capability} executed`,
          };
        },
      };
      adapters.set(capability, adapter);
      return instance;
    },

    async run(capability, input, runOptions) {
      const intent = buildIntent(capability, input, runOptions);

      // Fire onDecision hook
      if (options.onDecision) {
        const decision = evaluate(intent, policyDoc);
        options.onDecision({
          capability,
          action: decision.action,
          reason: decision.reason,
          matched_rule: decision.matched_rule,
          timestamp: new Date().toISOString(),
        });
      }

      const raw = await executor.execute(intent);
      const result = toMapResult(raw, intent);

      // Handle approval_required — always store for .approve()
      if (result.status === "approval_required") {
        const approvalRef = result.approval_reference!;

        // Store the original intent so .approve() can re-execute it
        pendingApprovals.set(approvalRef, { intent });

        // Notify the caller if a handler is configured
        if (options.onApprovalRequired) {
          await options.onApprovalRequired({
            capability,
            input_summary: input,
            reason: result.summary,
            approval_reference: approvalRef,
            approve: async () => {
              return instance.approve(approvalRef);
            },
          });
        }

        return result;
      }

      return result;
    },

    async approve(approvalReference) {
      const pending = pendingApprovals.get(approvalReference);
      if (!pending) {
        throw new Error(
          `No pending approval found for reference: ${approvalReference}. ` +
            `Make sure you're using the approval_reference from the original run() result.`,
        );
      }

      pendingApprovals.delete(approvalReference);

      // Execute via executeApproved — skips policy gate without mutating shared state
      const raw = await executor.executeApproved(pending.intent);
      const result = toMapResult(raw, pending.intent);
      return result;
    },

    setPolicy(policy) {
      policyDoc = typeof policy === "string"
        ? JSON.parse(readFileSync(policy, "utf8")) as PolicyDocument
        : compilePolicy(policy, options.defaultAction);
      executor.setPolicy(policyDoc);
    },

    getPolicy() {
      return policyDoc;
    },

    check(capability, input, checkOptions) {
      const intent = buildIntent(capability, input, checkOptions);
      const decision = evaluate(intent, policyDoc);
      return {
        action: decision.action,
        reason: decision.reason,
        matched_rule: decision.matched_rule,
      };
    },
  };

  return instance;
}

// ─── Re-export everything for advanced usage ──────────────────────────────────

export type {
  PolicyDocument,
  PolicyRule,
  PolicyCondition,
  ExecutionAdapter,
  ExecutionResult,
  ExecutionReceipt,
  Intent,
  RequesterIdentity,
} from "./core/types.js";

export { Executor } from "./core/execution/index.js";
export { evaluate } from "./core/policy/index.js";
export { HttpAdapter } from "./adapters/http-adapter.js";
export { PaymentExecuteAdapter, PaymentRefundAdapter } from "./adapters/payment-adapter.js";
export { DbReadAdapter } from "./adapters/db-read-adapter.js";
