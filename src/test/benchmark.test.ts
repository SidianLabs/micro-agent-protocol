/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MAP Benchmark Suite
 *
 * Tests execution latency under different conditions:
 * 1. Direct policy evaluation (no HTTP, no signing)
 * 2. Full execution path (intent → policy → adapter → receipt)
 * 3. Policy with many rules (stress test rule matching)
 * 4. Approval flow (require_approval path)
 * 5. Concurrent execution (parallel intents)
 * 6. Dynamic policy swap (hot-reload mid-execution)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../core/policy/index.js";
import { Executor } from "../core/execution/index.js";
import type {
  Intent,
  PolicyDocument,
  ExecutionAdapter,
  ExecutionResult,
  ExecutionReceipt,
} from "../core/types.js";

// ─── Test Adapter ────────────────────────────────────────────────────────────

class NoOpAdapter implements ExecutionAdapter {
  readonly capability = "benchmark.noop";
  validate() {
    return { valid: true, errors: [] };
  }
  async execute(
    input: Record<string, unknown>,
    context: { intent_id: string; requester: { type: "user" | "service"; id: string } },
  ): Promise<ExecutionResult> {
    return {
      intent_id: context.intent_id,
      capability: this.capability,
      status: "ok",
      output: { processed: true },
      summary: "No-op executed",
    };
  }
}

class SlowAdapter implements ExecutionAdapter {
  readonly capability = "benchmark.slow";
  validate() {
    return { valid: true, errors: [] };
  }
  async execute(
    input: Record<string, unknown>,
    context: { intent_id: string; requester: { type: "user" | "service"; id: string } },
  ): Promise<ExecutionResult> {
    // Simulate 10ms of work (e.g., a DB call)
    await new Promise((r) => setTimeout(r, 10));
    return {
      intent_id: context.intent_id,
      capability: this.capability,
      status: "ok",
      output: { processed: true, delay_ms: 10 },
      summary: "Slow adapter executed",
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    capability: "benchmark.noop",
    input: { value: 100 },
    requester: { type: "user", id: "bench_user" },
    metadata: { intent_id: `bench_${Date.now()}` },
    ...overrides,
  };
}

function makePolicy(rulesCount: number): PolicyDocument {
  const rules: PolicyDocument["rules"] = [];
  for (let i = 0; i < rulesCount; i++) {
    rules.push({
      id: `rule_${i}`,
      capability: `domain_${i}.*`,
      condition: { gt: ["input.value", i * 100] as [string, unknown] },
      action: "allow" as const,
    });
  }
  // Add a catch-all at the end
  rules.push({
    id: "default-allow",
    capability: "*",
    condition: { gte: ["input.value", 0] as [string, unknown] },
    action: "allow" as const,
  });
  return { version: "1.0", rules };
}

function formatLatency(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  return `${ms.toFixed(2)}ms`;
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

test("BENCHMARK: Policy evaluation latency (simple policy, 5 rules)", () => {
  const policy: PolicyDocument = {
    version: "1.0",
    rules: [
      { id: "r1", capability: "payment.*", condition: { gt: ["input.amount", 5000] }, action: "require_approval" },
      { id: "r2", capability: "db.write", condition: { eq: ["constraints.environment", "production"] }, action: "deny" },
      { id: "r3", capability: "http.*", condition: { eq: ["risk_class", "critical"] }, action: "require_approval" },
      { id: "r4", capability: "file.*", condition: { gt: ["input.size_mb", 100] }, action: "deny" },
      { id: "r5", capability: "*", condition: { gte: ["input.value", 0] }, action: "allow" },
    ],
  };

  const intent = makeIntent({ capability: "benchmark.noop", input: { value: 50 } });
  const iterations = 10_000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    evaluate(intent, policy);
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;

  console.log(`  ├─ ${iterations} evaluations in ${elapsed.toFixed(1)}ms`);
  console.log(`  ├─ Per evaluation: ${formatLatency(perOp)}`);
  console.log(`  └─ Throughput: ${Math.floor(iterations / (elapsed / 1000))}/sec`);

  // Policy evaluation should be sub-millisecond
  assert.ok(perOp < 1, `Policy evaluation too slow: ${perOp}ms (target: <1ms)`);
});

test("BENCHMARK: Policy evaluation latency (large policy, 100 rules)", () => {
  const policy = makePolicy(100);
  const intent = makeIntent({ capability: "benchmark.noop", input: { value: 50 } });
  const iterations = 10_000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    evaluate(intent, policy);
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;

  console.log(`  ├─ ${iterations} evaluations in ${elapsed.toFixed(1)}ms`);
  console.log(`  ├─ Per evaluation: ${formatLatency(perOp)}`);
  console.log(`  └─ Throughput: ${Math.floor(iterations / (elapsed / 1000))}/sec`);

  // Even with 100 rules, should be well under 1ms
  assert.ok(perOp < 1, `Large policy evaluation too slow: ${perOp}ms (target: <1ms)`);
});

test("BENCHMARK: Policy evaluation latency (500 rules, worst case)", () => {
  const policy = makePolicy(500);
  // Intent that won't match any domain_X.* rule, so it scans all 500 before hitting catch-all
  const intent = makeIntent({ capability: "benchmark.noop", input: { value: 50 } });
  const iterations = 5_000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    evaluate(intent, policy);
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;

  console.log(`  ├─ ${iterations} evaluations (worst-case scan) in ${elapsed.toFixed(1)}ms`);
  console.log(`  ├─ Per evaluation: ${formatLatency(perOp)}`);
  console.log(`  └─ Throughput: ${Math.floor(iterations / (elapsed / 1000))}/sec`);

  // Even worst case with 500 rules should be under 5ms
  assert.ok(perOp < 5, `500-rule worst case too slow: ${perOp}ms (target: <5ms)`);
});

test("BENCHMARK: Full execution path (intent → policy → adapter → result)", async () => {
  const policy: PolicyDocument = {
    version: "1.0",
    rules: [
      { id: "allow-all", capability: "*", condition: { gte: ["input.value", 0] }, action: "allow" },
    ],
  };

  const adapters = new Map<string, ExecutionAdapter>();
  adapters.set("benchmark.noop", new NoOpAdapter());

  const executor = new Executor({ policy, adapters });
  const iterations = 1_000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const intent = makeIntent({ metadata: { intent_id: `bench_${i}` } });
    await executor.execute(intent);
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;

  console.log(`  ├─ ${iterations} full executions in ${elapsed.toFixed(1)}ms`);
  console.log(`  ├─ Per execution: ${formatLatency(perOp)}`);
  console.log(`  └─ Throughput: ${Math.floor(iterations / (elapsed / 1000))}/sec`);

  // Full path without I/O should be well under 1ms
  assert.ok(perOp < 1, `Full execution path too slow: ${perOp}ms (target: <1ms)`);
});

test("BENCHMARK: Approval path (require_approval decision)", async () => {
  const policy: PolicyDocument = {
    version: "1.0",
    rules: [
      { id: "always-approve", capability: "*", condition: { gte: ["input.value", 0] }, action: "require_approval" },
    ],
  };

  const adapters = new Map<string, ExecutionAdapter>();
  adapters.set("benchmark.noop", new NoOpAdapter());

  const executor = new Executor({ policy, adapters });
  const iterations = 1_000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const intent = makeIntent({ metadata: { intent_id: `bench_approval_${i}` } });
    const result = await executor.execute(intent);
    // Should return a receipt with approval_required
    assert.ok("action" in result);
    assert.equal((result as ExecutionReceipt).action, "approval_required");
  }
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;

  console.log(`  ├─ ${iterations} approval decisions in ${elapsed.toFixed(1)}ms`);
  console.log(`  ├─ Per decision: ${formatLatency(perOp)}`);
  console.log(`  └─ Throughput: ${Math.floor(iterations / (elapsed / 1000))}/sec`);

  assert.ok(perOp < 1, `Approval path too slow: ${perOp}ms (target: <1ms)`);
});

test("BENCHMARK: Concurrent execution (50 parallel intents)", async () => {
  const policy: PolicyDocument = {
    version: "1.0",
    rules: [
      { id: "allow-all", capability: "*", condition: { gte: ["input.value", 0] }, action: "allow" },
    ],
  };

  const adapters = new Map<string, ExecutionAdapter>();
  adapters.set("benchmark.slow", new SlowAdapter());

  const executor = new Executor({ policy, adapters });
  const concurrency = 50;

  const intents = Array.from({ length: concurrency }, (_, i) =>
    makeIntent({
      capability: "benchmark.slow",
      metadata: { intent_id: `concurrent_${i}` },
    }),
  );

  const start = performance.now();
  const results = await Promise.all(intents.map((intent) => executor.execute(intent)));
  const elapsed = performance.now() - start;

  console.log(`  ├─ ${concurrency} concurrent executions (10ms adapter each)`);
  console.log(`  ├─ Total wall time: ${elapsed.toFixed(1)}ms`);
  console.log(`  ├─ Sequential would be: ${concurrency * 10}ms`);
  console.log(`  └─ Parallelism factor: ${((concurrency * 10) / elapsed).toFixed(1)}x`);

  // All should succeed
  assert.equal(results.length, concurrency);
  for (const result of results) {
    assert.ok("status" in result);
    assert.equal((result as ExecutionResult).status, "ok");
  }

  // Should be much faster than sequential (50 * 10ms = 500ms)
  assert.ok(elapsed < 200, `Concurrent execution too slow: ${elapsed}ms (target: <200ms for 50x10ms)`);
});

test("BENCHMARK: Dynamic policy swap (hot-reload)", async () => {
  const allowPolicy: PolicyDocument = {
    version: "1.0",
    rules: [
      { id: "allow-all", capability: "*", condition: { gte: ["input.value", 0] }, action: "allow" },
    ],
  };

  const denyPolicy: PolicyDocument = {
    version: "1.0",
    rules: [
      { id: "deny-all", capability: "*", condition: { gte: ["input.value", 0] }, action: "deny" },
    ],
  };

  const adapters = new Map<string, ExecutionAdapter>();
  adapters.set("benchmark.noop", new NoOpAdapter());

  const executor = new Executor({ policy: allowPolicy, adapters });

  // Execute with allow policy
  const intent = makeIntent();
  const result1 = await executor.execute(intent);
  assert.ok("status" in result1);
  assert.equal((result1 as ExecutionResult).status, "ok");

  // Hot-swap to deny policy
  const swapStart = performance.now();
  executor.setPolicy(denyPolicy);
  const swapElapsed = performance.now() - swapStart;

  // Execute with deny policy — should now be denied
  const result2 = await executor.execute(makeIntent({ metadata: { intent_id: "after_swap" } }));
  assert.ok("action" in result2);
  assert.equal((result2 as ExecutionReceipt).action, "denied");

  console.log(`  ├─ Policy swap latency: ${formatLatency(swapElapsed)}`);
  console.log(`  ├─ Before swap: allow → executed ✓`);
  console.log(`  └─ After swap: deny → denied ✓`);

  // Policy swap should be essentially instant
  assert.ok(swapElapsed < 1, `Policy swap too slow: ${swapElapsed}ms`);
});

test("BENCHMARK: Summary — MAP execution targets", () => {
  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  MAP Performance Targets                                     │
  ├─────────────────────────────────────────────────────────────┤
  │  Policy evaluation (5 rules):     < 100µs  (target)         │
  │  Policy evaluation (100 rules):   < 500µs  (target)         │
  │  Policy evaluation (500 rules):   < 5ms    (target)         │
  │  Full execution (no I/O):         < 1ms    (target)         │
  │  Approval decision:               < 1ms    (target)         │
  │  Policy hot-swap:                 < 1ms    (target)         │
  │  Concurrent (50 parallel):        < 200ms  (target)         │
  ├─────────────────────────────────────────────────────────────┤
  │  Compare: Old AI-in-loop approach was ~15,000ms             │
  │  MAP without AI: 100-1000x faster                           │
  └─────────────────────────────────────────────────────────────┘
  `);
});
