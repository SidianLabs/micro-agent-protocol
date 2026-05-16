/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DR Drill + Failover Conformance Tests
 *
 * These tests exercise persistence failover for every stateful component:
 *  1. Task store failover
 *  2. Receipt store failover
 *  3. Rate limit state recovery
 *  4. Audit chain recovery
 *  5. Async queue recovery
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";

import { TaskStore } from "../control-plane/task-store.js";
import { ReceiptStore } from "../control-plane/receipt-store.js";
import { AsyncTaskQueue } from "../control-plane/async-queue.js";
import {
  hydrateRateLimitState,
  persistRateLimitState,
  hydrateAuditEvents,
  persistAuditEvents,
  type AuditEvent,
  type AuditCheckpoint,
} from "../server/state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReceipt(taskId: string, receiptId?: string): any {
  return {
    receipt_id: receiptId ?? `receipt:${taskId}`,
    task_id: taskId,
    tenant_id: "tenant_dr",
    agent_id: "agent-dr",
    action_taken: "test.action",
    resource_touched: "test-resource",
    policy_checks: ["check_1"],
    timestamp: new Date().toISOString(),
    result_hash: `sha256:${taskId}`,
    signature: `sig:${taskId}`,
  };
}

function makeTaskResult(taskId: string, status: string = "completed"): any {
  return {
    task_id: taskId,
    status,
    summary: "test task",
    structured_output: {},
    followup_required: false,
  };
}

function makeTaskReceipt(taskId: string): any {
  return {
    receipt_id: `receipt:${taskId}`,
    task_id: taskId,
    agent_id: "agent-dr",
    action_taken: "test.action",
    resource_touched: "test-resource",
    policy_checks: ["check_1"],
    timestamp: new Date().toISOString(),
    result_hash: `sha256:${taskId}`,
    signature: `sig:${taskId}`,
  };
}

// ---------------------------------------------------------------------------
// 1. Task store failover
// ---------------------------------------------------------------------------

test("DR drill: task store failover — persist to file, simulate crash, verify all tasks readable", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-task-"));
  const filePath = join(tempDir, "tasks.json");

  try {
    // Phase 1: Create tasks and persist
    const storeA = new TaskStore({ filePath });
    const taskIds = ["dr-task-1", "dr-task-2", "dr-task-3"];
    for (const taskId of taskIds) {
      storeA.save({
        task_id: taskId,
        requester_identity: { type: "user", id: "dr-user", tenant_id: "tenant_dr" },
        capability: "test.capability",
        target_agent: "agent-dr",
        result: makeTaskResult(taskId),
        receipt: makeTaskReceipt(taskId),
      });
    }

    // Manually persist to disk (save() does this automatically but be explicit)
    // The store already auto-persists. Now simulate crash by creating a new store.
    const storeB = new TaskStore({ filePath });

    // Verify all tasks are readable
    for (const taskId of taskIds) {
      const restored = storeB.get(taskId);
      assert.ok(restored, `Task ${taskId} should survive failover`);
      assert.equal(restored!.task_id, taskId);
      assert.equal(restored!.capability, "test.capability");
      assert.equal(restored!.target_agent, "agent-dr");
      assert.equal(restored!.status, "completed");
    }

    // Verify task count
    const allTasks = storeB.list();
    assert.equal(allTasks.length, 3);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("DR drill: task store failover with sqlite db — persist, crash, verify", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-task-db-"));
  const dbPath = join(tempDir, "tasks.db");

  try {
    const storeA = new TaskStore({ dbPath });
    storeA.save({
      task_id: "dr-db-task-1",
      requester_identity: { type: "user", id: "dr-user" },
      capability: "db.read",
      target_agent: "db-agent",
      result: makeTaskResult("dr-db-task-1"),
      receipt: makeTaskReceipt("dr-db-task-1"),
    });

    // Simulate crash
    const storeB = new TaskStore({ dbPath });
    const restored = storeB.get("dr-db-task-1");
    assert.ok(restored);
    assert.equal(restored!.task_id, "dr-db-task-1");
    assert.equal(restored!.capability, "db.read");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Receipt store failover
// ---------------------------------------------------------------------------

test("DR drill: receipt store failover — create, persist, crash, verify all readable", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-receipt-"));
  const filePath = join(tempDir, "receipts.json");

  try {
    const storeA = new ReceiptStore({ filePath });
    const receiptIds = ["dr-receipt-1", "dr-receipt-2", "dr-receipt-3"];
    for (const receiptId of receiptIds) {
      storeA.append(makeReceipt(receiptId.replace("dr-receipt-", "dr-task-"), receiptId));
    }

    // Simulate crash
    const storeB = new ReceiptStore({ filePath });
    const allReceipts = storeB.list();
    assert.equal(allReceipts.length, 3);

    for (const receiptId of receiptIds) {
      const restored = storeB.get(receiptId);
      assert.ok(restored, `Receipt ${receiptId} should survive failover`);
      assert.equal(restored!.receipt_id, receiptId);
      assert.equal(restored!.tenant_id, "tenant_dr");
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("DR drill: receipt store failover — verify integrity after recovery", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-receipt-int-"));
  const filePath = join(tempDir, "receipts.json");

  try {
    const storeA = new ReceiptStore({ filePath });
    storeA.append(makeReceipt("task-a", "receipt-a"));
    storeA.append(makeReceipt("task-b", "receipt-b"));

    const storeB = new ReceiptStore({ filePath });
    const integrity = storeB.verifyReceiptIntegrity();
    assert.equal(integrity.valid, true);
    assert.equal(integrity.total, 2);
    assert.equal(integrity.errors.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Rate limit state recovery
// ---------------------------------------------------------------------------

test("DR drill: rate limit state recovery — create events, persist, crash, verify limits restored", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-rate-"));
  const statePath = join(tempDir, "rate-limits.json");
  const windowMs = 60_000; // 1 minute window

  try {
    // Phase 1: Create rate limit events
    const globalEventsA: number[] = [];
    const tenantEventsA = new Map<string, number[]>();

    const now = Date.now();
    globalEventsA.push(now - 10000, now - 5000, now);

    const tenantAEvents = [now - 30000, now - 15000, now];
    tenantEventsA.set("tenant_dr_a", tenantAEvents);

    persistRateLimitState(statePath, windowMs, globalEventsA, tenantEventsA);

    // Phase 2: Simulate crash — hydrate from scratch
    const globalEventsB: number[] = [];
    const tenantEventsB = new Map<string, number[]>();

    hydrateRateLimitState(statePath, windowMs, globalEventsB, tenantEventsB);

    assert.equal(globalEventsB.length, 3, "Global rate limit events should be restored");
    assert.ok(tenantEventsB.has("tenant_dr_a"), "Tenant rate limit events should be restored");
    assert.equal(tenantEventsB.get("tenant_dr_a")!.length, 3);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("DR drill: rate limit state recovery — expired events pruned on hydrate", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-rate-prune-"));
  const statePath = join(tempDir, "rate-limits.json");
  const windowMs = 60_000;

  try {
    const globalEventsA: number[] = [];
    const tenantEventsA = new Map<string, number[]>();

    const now = Date.now();
    // Only one event is within the window
    globalEventsA.push(now - 120_000, now - 90_000, now);
    persistRateLimitState(statePath, windowMs, globalEventsA, tenantEventsA);

    const globalEventsB: number[] = [];
    const tenantEventsB = new Map<string, number[]>();
    hydrateRateLimitState(statePath, windowMs, globalEventsB, tenantEventsB);

    // Only the recent event should survive
    assert.equal(globalEventsB.length, 1, "Expired rate limit events should be pruned");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Audit chain recovery
// ---------------------------------------------------------------------------

test("DR drill: audit chain recovery — create events with checkpoints, crash, verify chain integrity", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-audit-"));
  const auditPath = join(tempDir, "audit.json");

  try {
    // Phase 1: Create audit events with checkpoints
    const eventsA: AuditEvent[] = [];
    const checkpointsA: AuditCheckpoint[] = [];

    // Create 5 audit events
    for (let i = 1; i <= 5; i++) {
      eventsA.push({
        timestamp: new Date().toISOString(),
        request_id: randomUUID(),
        code: "test_event",
        message: `Audit event ${i}`,
        method: "POST",
        route: "/dispatch",
        tenant_id: "tenant_dr",
        target_agent: "agent-dr",
        chain_index: i,
        prev_event_hash: i === 1 ? "GENESIS" : `hash-${i - 1}`,
        event_hash: `hash-${i}`,
      });
    }

    checkpointsA.push({
      checkpoint_id: "checkpoint-1",
      created_at: new Date().toISOString(),
      last_chain_index: 5,
      last_event_hash: "hash-5",
      key_id: "key-1",
      signature: "sig-checkpoint-1",
    });

    persistAuditEvents(auditPath, eventsA, checkpointsA);

    // Phase 2: Simulate crash
    const eventsB: AuditEvent[] = [];
    const checkpointsB: AuditCheckpoint[] = [];
    hydrateAuditEvents(auditPath, 100, eventsB, checkpointsB);

    assert.equal(eventsB.length, 5, "All audit events should survive failover");
    assert.equal(checkpointsB.length, 1, "Audit checkpoints should survive failover");
    assert.equal(eventsB[0]!.chain_index, 1);
    assert.equal(eventsB[4]!.chain_index, 5);
    assert.equal(eventsB[0]!.prev_event_hash, "GENESIS");
    assert.equal(eventsB[1]!.prev_event_hash, "hash-1");

    // Verify chain integrity after recovery
    let chainOk = true;
    for (let i = 0; i < eventsB.length; i++) {
      const event = eventsB[i]!;
      if (event.chain_index !== i + 1) {
        chainOk = false;
        break;
      }
      const expectedPrev = i === 0 ? "GENESIS" : eventsB[i - 1]!.event_hash;
      if (event.prev_event_hash !== expectedPrev) {
        chainOk = false;
        break;
      }
    }
    assert.equal(chainOk, true, "Audit chain integrity must hold after recovery");

    // Verify checkpoint links to last event
    const checkpoint = checkpointsB[0]!;
    assert.equal(checkpoint.last_chain_index, 5);
    assert.equal(checkpoint.last_event_hash, "hash-5");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("DR drill: audit chain recovery — empty store yields empty events", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-audit-empty-"));
  const auditPath = join(tempDir, "audit.json");

  try {
    const eventsB: AuditEvent[] = [];
    const checkpointsB: AuditCheckpoint[] = [];
    hydrateAuditEvents(auditPath, 100, eventsB, checkpointsB);

    assert.equal(eventsB.length, 0);
    assert.equal(checkpointsB.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Async queue recovery
// ---------------------------------------------------------------------------

test("DR drill: async queue recovery — enqueue jobs, persist state, crash, verify jobs still queued", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-queue-"));
  const storePath = join(tempDir, "dead-letters.json");

  try {
    // Phase 1: Enqueue jobs and let some fail to dead letter
    const queueA = new AsyncTaskQueue({
      maxAttempts: 1,
      retryDelayMs: 1,
      deadLetterStorePath: storePath,
    });

    let job1Ran = false;
    let job2DeadLettered = false;

    queueA.enqueue({
      taskId: "dr-queue-job-1",
      tenantId: "tenant_dr",
      run: async () => {
        job1Ran = true;
      },
      onDeadLetter: () => {
        throw new Error("should not dead letter");
      },
    });

    queueA.enqueue({
      taskId: "dr-queue-job-2",
      tenantId: "tenant_dr",
      run: async () => {
        throw new Error("always_fail");
      },
      onDeadLetter: (record) => {
        job2DeadLettered = true;
        assert.equal(record.task_id, "dr-queue-job-2");
      },
    });

    await delay(50);

    assert.equal(job1Ran, true);
    assert.equal(job2DeadLettered, true);
    assert.equal(queueA.listDeadLetters().length, 1);

    // Phase 2: Simulate crash — new queue from same file
    const queueB = new AsyncTaskQueue({
      deadLetterStorePath: storePath,
    });

    const restoredDeadLetters = queueB.listDeadLetters();
    assert.equal(restoredDeadLetters.length, 1, "Dead letters should survive failover");
    assert.equal(restoredDeadLetters[0]!.task_id, "dr-queue-job-2");
    assert.equal(restoredDeadLetters[0]!.tenant_id, "tenant_dr");
    assert.match(restoredDeadLetters[0]!.error ?? "", /always_fail/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("DR drill: async queue recovery — tenant scoping preserved across failover", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dr-queue-tenant-"));
  const storePath = join(tempDir, "dead-letters.json");

  try {
    const queueA = new AsyncTaskQueue({
      maxAttempts: 1,
      retryDelayMs: 1,
      deadLetterStorePath: storePath,
    });

    queueA.enqueue({
      taskId: "dr-tenant-a-job",
      tenantId: "tenant_a",
      run: async () => {
        throw new Error("fail_a");
      },
      onDeadLetter: () => {},
    });

    queueA.enqueue({
      taskId: "dr-tenant-b-job",
      tenantId: "tenant_b",
      run: async () => {
        throw new Error("fail_b");
      },
      onDeadLetter: () => {},
    });

    await delay(50);

    const queueB = new AsyncTaskQueue({ deadLetterStorePath: storePath });
    assert.equal(queueB.listDeadLettersByTenant("tenant_a").length, 1);
    assert.equal(queueB.listDeadLettersByTenant("tenant_b").length, 1);
    assert.equal(
      queueB.listDeadLettersByTenant("tenant_a")[0]!.task_id,
      "dr-tenant-a-job",
    );
    assert.equal(
      queueB.listDeadLettersByTenant("tenant_b")[0]!.task_id,
      "dr-tenant-b-job",
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
