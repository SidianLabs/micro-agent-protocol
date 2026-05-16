/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../core/policy/index.js";
import type { Intent, PolicyDocument } from "../core/types.js";

const baseIntent: Intent = {
  capability: "payment.execute",
  input: { amount: 5000, currency: "USD", vendor_id: "vendor_abc" },
  requester: { type: "user", id: "user_123", tenant_id: "acme" },
  constraints: { environment: "production" },
  risk_class: "high",
};

const policy: PolicyDocument = {
  version: "1.0",
  rules: [
    {
      id: "critical-always-approval",
      capability: "*",
      condition: { eq: ["risk_class", "critical"] },
      action: "require_approval",
    },
    {
      id: "high-value-payment",
      capability: "payment.*",
      condition: { gt: ["input.amount", 1000] },
      action: "require_approval",
    },
    {
      id: "production-db-write-deny",
      capability: "db.write",
      condition: { eq: ["constraints.environment", "production"] },
      action: "deny",
    },
    {
      id: "low-value-allow",
      capability: "payment.*",
      condition: { lte: ["input.amount", 1000] },
      action: "allow",
    },
    {
      id: "default-allow",
      capability: "*",
      condition: { eq: ["capability", "capability"] },
      action: "allow",
    },
  ],
};

test("policy requires approval for high-value payments", () => {
  const decision = evaluate(baseIntent, policy);
  assert.equal(decision.action, "require_approval");
  assert.equal(decision.matched_rule, "high-value-payment");
});

test("policy allows low-value payments", () => {
  const intent: Intent = {
    ...baseIntent,
    input: { amount: 500, currency: "USD" },
  };
  const decision = evaluate(intent, policy);
  assert.equal(decision.action, "allow");
  assert.equal(decision.matched_rule, "low-value-allow");
});

test("policy denies production db writes", () => {
  const intent: Intent = {
    ...baseIntent,
    capability: "db.write",
    input: { query: "DELETE FROM users" },
    constraints: { environment: "production" },
  };
  const decision = evaluate(intent, policy);
  assert.equal(decision.action, "deny");
  assert.equal(decision.matched_rule, "production-db-write-deny");
});

test("policy requires approval for critical risk class regardless of capability", () => {
  const intent: Intent = {
    ...baseIntent,
    capability: "http.request",
    input: { url: "https://example.com" },
    risk_class: "critical",
  };
  const decision = evaluate(intent, policy);
  assert.equal(decision.action, "require_approval");
  assert.equal(decision.matched_rule, "critical-always-approval");
});

test("policy allows when no rules match", () => {
  const emptyPolicy: PolicyDocument = { version: "1.0", rules: [] };
  const decision = evaluate(baseIntent, emptyPolicy);
  assert.equal(decision.action, "allow");
  assert.equal(decision.reason, "Default allow - no rules matched");
});

test("policy evaluates rules in order (first match wins)", () => {
  // Both "critical-always-approval" and "high-value-payment" could match
  // but critical comes first
  const intent: Intent = {
    ...baseIntent,
    risk_class: "critical",
    input: { amount: 5000 },
  };
  const decision = evaluate(intent, policy);
  assert.equal(decision.matched_rule, "critical-always-approval");
});

test("policy supports AND conditions", () => {
  const andPolicy: PolicyDocument = {
    version: "1.0",
    rules: [
      {
        id: "high-value-prod",
        capability: "payment.*",
        condition: {
          and: [
            { gt: ["input.amount", 1000] },
            { eq: ["constraints.environment", "production"] },
          ],
        },
        action: "deny",
      },
    ],
  };
  const decision = evaluate(baseIntent, andPolicy);
  assert.equal(decision.action, "deny");
});

test("policy supports OR conditions", () => {
  const orPolicy: PolicyDocument = {
    version: "1.0",
    rules: [
      {
        id: "risky-or-expensive",
        capability: "*",
        condition: {
          or: [
            { eq: ["risk_class", "critical"] },
            { gt: ["input.amount", 10000] },
          ],
        },
        action: "require_approval",
      },
    ],
  };
  // Neither condition is true for baseIntent (risk=high, amount=5000)
  const decision = evaluate(baseIntent, orPolicy);
  assert.equal(decision.action, "allow");

  // But critical risk triggers it
  const criticalIntent: Intent = { ...baseIntent, risk_class: "critical" };
  const decision2 = evaluate(criticalIntent, orPolicy);
  assert.equal(decision2.action, "require_approval");
});

test("policy supports NOT conditions", () => {
  const notPolicy: PolicyDocument = {
    version: "1.0",
    rules: [
      {
        id: "deny-non-users",
        capability: "*",
        condition: { not: { eq: ["requester.type", "user"] } },
        action: "deny",
      },
    ],
  };
  // baseIntent has type=user, so NOT(type==user) = false → no match → allow
  const decision = evaluate(baseIntent, notPolicy);
  assert.equal(decision.action, "allow");

  // service requester → NOT(type==user) = true → deny
  const serviceIntent: Intent = {
    ...baseIntent,
    requester: { type: "service", id: "svc_1" },
  };
  const decision2 = evaluate(serviceIntent, notPolicy);
  assert.equal(decision2.action, "deny");
});

test("policy supports IN operator", () => {
  const inPolicy: PolicyDocument = {
    version: "1.0",
    rules: [
      {
        id: "allowed-currencies",
        capability: "payment.*",
        condition: { not: { in: ["input.currency", ["USD", "EUR", "GBP"]] } },
        action: "deny",
      },
    ],
  };
  // USD is in the list, so NOT(in) = false → no match → allow
  const decision = evaluate(baseIntent, inPolicy);
  assert.equal(decision.action, "allow");

  // JPY is not in the list, so NOT(in) = true → deny
  const jpyIntent: Intent = {
    ...baseIntent,
    input: { ...baseIntent.input, currency: "JPY" },
  };
  const decision2 = evaluate(jpyIntent, inPolicy);
  assert.equal(decision2.action, "deny");
});
