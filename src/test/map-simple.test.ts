/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MAP Simple API Tests
 *
 * These tests prove the 10-minute developer experience works correctly.
 * Every test uses only the `map()` function — no internal types needed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { map } from "../map.js";

// ─── Basic execution ──────────────────────────────────────────────────────────

test("map: allow-all policy executes immediately", async () => {
  const agent = map(); // no policy = allow everything

  agent.can("hello.greet", async (input) => ({
    message: `Hello, ${input.name}!`,
  }));

  const result = await agent.run("hello.greet", { name: "World" });

  assert.equal(result.status, "executed");
  assert.deepEqual(result.output, { message: "Hello, World!" });
  assert.ok(result.receipt.id.startsWith("receipt:"));
  assert.equal(result.receipt.action, "executed");
});

test("map: deny rule blocks execution", async () => {
  const agent = map({
    policy: [
      { when: "db.write", env: "production", require: "deny" },
    ],
  });

  agent.can("db.write", async () => ({ rows_affected: 1 }));

  const result = await agent.run("db.write", { query: "DELETE FROM users" }, {
    environment: "production",
  });

  assert.equal(result.status, "denied");
  assert.equal(result.output, undefined);
  assert.equal(result.receipt.action, "denied");
});

test("map: allow rule passes through", async () => {
  const agent = map({
    policy: [
      { when: "db.write", env: "production", require: "deny" },
      { when: "db.write", require: "allow" },
    ],
  });

  agent.can("db.write", async () => ({ rows_affected: 1 }));

  const result = await agent.run("db.write", { query: "INSERT INTO logs" }, {
    environment: "staging",
  });

  assert.equal(result.status, "executed");
  assert.deepEqual(result.output, { rows_affected: 1 });
});

// ─── Approval flow ────────────────────────────────────────────────────────────

test("map: require_approval stops execution and provides approval_reference", async () => {
  const agent = map({
    policy: [
      { when: "payment.*", amount_gt: 1000, require: "approval" },
    ],
  });

  agent.can("payment.execute", async (input) => ({
    charge_id: `ch_${input.amount}`,
    status: "succeeded",
  }));

  const result = await agent.run("payment.execute", {
    amount: 5000,
    currency: "USD",
  });

  assert.equal(result.status, "approval_required");
  assert.ok(result.approval_reference?.startsWith("approval:"));
  assert.equal(result.output, undefined);
});

test("map: approve() executes the pending intent", async () => {
  const agent = map({
    policy: [
      { when: "payment.*", amount_gt: 1000, require: "approval" },
    ],
  });

  agent.can("payment.execute", async (input) => ({
    charge_id: `ch_${input.amount}`,
    status: "succeeded",
  }));

  // First run — blocked
  const pending = await agent.run("payment.execute", {
    amount: 5000,
    currency: "USD",
  });
  assert.equal(pending.status, "approval_required");

  // Approve it
  const approved = await agent.approve(pending.approval_reference!);
  assert.equal(approved.status, "executed");
  assert.equal((approved.output as { status: string }).status, "succeeded");
});

test("map: approve() throws for unknown reference", async () => {
  const agent = map();

  await assert.rejects(
    () => agent.approve("approval:nonexistent"),
    /No pending approval found/,
  );
});

// ─── onApprovalRequired callback ─────────────────────────────────────────────

test("map: onApprovalRequired callback is called with correct data", async () => {
  let notified = false;
  let notifiedCapability = "";
  let notifiedRef = "";

  const agent = map({
    policy: [
      { when: "payment.*", amount_gt: 100, require: "approval" },
    ],
    onApprovalRequired: ({ capability, approval_reference }) => {
      notified = true;
      notifiedCapability = capability;
      notifiedRef = approval_reference;
    },
  });

  agent.can("payment.execute", async () => ({ status: "succeeded" }));

  await agent.run("payment.execute", { amount: 500, currency: "USD" });

  assert.ok(notified);
  assert.equal(notifiedCapability, "payment.execute");
  assert.ok(notifiedRef.startsWith("approval:"));
});

// ─── onDecision hook ─────────────────────────────────────────────────────────

test("map: onDecision hook fires for every run", async () => {
  const decisions: string[] = [];

  const agent = map({
    policy: [
      { when: "payment.*", amount_gt: 1000, require: "approval" },
    ],
    onDecision: ({ action }) => {
      decisions.push(action);
    },
  });

  agent.can("payment.execute", async () => ({ status: "succeeded" }));

  await agent.run("payment.execute", { amount: 50 });   // allow
  await agent.run("payment.execute", { amount: 5000 }); // require_approval

  assert.deepEqual(decisions, ["allow", "require_approval"]);
});

// ─── Policy hot-swap ─────────────────────────────────────────────────────────

test("map: setPolicy() changes behavior immediately", async () => {
  const agent = map({
    policy: [{ when: "*", require: "allow" }],
  });

  agent.can("payment.execute", async () => ({ status: "succeeded" }));

  // Before swap — allowed
  const before = await agent.run("payment.execute", { amount: 100 });
  assert.equal(before.status, "executed");

  // Swap to deny all
  agent.setPolicy([{ when: "*", require: "deny" }]);

  // After swap — denied
  const after = await agent.run("payment.execute", { amount: 100 });
  assert.equal(after.status, "denied");
});

// ─── check() dry run ─────────────────────────────────────────────────────────

test("map: check() returns decision without executing", async () => {
  let executed = false;

  const agent = map({
    policy: [
      { when: "payment.*", amount_gt: 1000, require: "approval" },
    ],
  });

  agent.can("payment.execute", async () => {
    executed = true;
    return { status: "succeeded" };
  });

  const check = agent.check("payment.execute", { amount: 5000 });

  assert.equal(check.action, "require_approval");
  assert.ok(check.matched_rule);
  assert.equal(executed, false); // never ran
});

test("map: check() returns allow for low-value payment", async () => {
  const agent = map({
    policy: [
      { when: "payment.*", amount_gt: 1000, require: "approval" },
    ],
  });

  const check = agent.check("payment.execute", { amount: 50 });
  assert.equal(check.action, "allow");
});

// ─── Chaining .can() ─────────────────────────────────────────────────────────

test("map: .can() is chainable", async () => {
  const agent = map()
    .can("hello.greet", async (input) => ({ message: `Hello ${input.name}` }))
    .can("hello.farewell", async (input) => ({ message: `Goodbye ${input.name}` }));

  const r1 = await agent.run("hello.greet", { name: "Alice" });
  const r2 = await agent.run("hello.farewell", { name: "Alice" });

  assert.equal(r1.status, "executed");
  assert.equal(r2.status, "executed");
  assert.equal((r1.output as { message: string }).message, "Hello Alice");
  assert.equal((r2.output as { message: string }).message, "Goodbye Alice");
});

// ─── Risk class ──────────────────────────────────────────────────────────────

test("map: risk class triggers approval", async () => {
  const agent = map({
    policy: [
      { when: "*", risk: "critical", require: "approval" },
    ],
  });

  agent.can("db.read", async () => ({ rows: [] }));

  const result = await agent.run("db.read", { query: "SELECT *" }, {
    risk: "critical",
  });

  assert.equal(result.status, "approval_required");
});

// ─── getPolicy() ─────────────────────────────────────────────────────────────

test("map: getPolicy() returns the compiled policy document", () => {
  const agent = map({
    policy: [
      { when: "payment.*", amount_gt: 1000, require: "approval" },
      { when: "db.write", env: "production", require: "deny" },
    ],
  });

  const policy = agent.getPolicy();

  assert.equal(policy.version, "1.0");
  assert.equal(policy.rules.length, 2);
  assert.equal(policy.rules[0].capability, "payment.*");
  assert.equal(policy.rules[0].action, "require_approval");
  assert.equal(policy.rules[1].capability, "db.write");
  assert.equal(policy.rules[1].action, "deny");
});

// ─── No handler registered ───────────────────────────────────────────────────

test("map: run() throws when no handler registered for capability", async () => {
  const agent = map();

  await assert.rejects(
    () => agent.run("unknown.capability", {}),
    /No adapter for capability/,
  );
});

// ─── Full PolicyDocument passthrough ─────────────────────────────────────────

test("map: accepts full PolicyDocument directly", async () => {
  const agent = map({
    policy: {
      version: "1.0",
      rules: [
        {
          id: "deny-prod-writes",
          capability: "db.write",
          condition: { eq: ["constraints.environment", "production"] },
          action: "deny",
        },
      ],
    },
  });

  agent.can("db.write", async () => ({ rows_affected: 1 }));

  const result = await agent.run("db.write", {}, { environment: "production" });
  assert.equal(result.status, "denied");

  const result2 = await agent.run("db.write", {}, { environment: "staging" });
  assert.equal(result2.status, "executed");
});
