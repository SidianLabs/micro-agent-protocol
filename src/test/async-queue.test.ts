import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AsyncTaskQueue } from "../control-plane/async-queue.js";

test("async queue retries and succeeds before dead-letter threshold", async () => {
  const queue = new AsyncTaskQueue({ maxAttempts: 3, retryDelayMs: 1 });
  let attempts = 0;
  let completed = false;

  queue.enqueue({
    taskId: "task_retry_success",
    run: async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("transient_failure");
      }
      completed = true;
    },
    onDeadLetter: () => {
      throw new Error("should_not_dead_letter");
    },
  });

  await delay(30);
  assert.equal(completed, true);
  assert.equal(attempts, 2);
  assert.equal(queue.listDeadLetters().length, 0);
});

test("async queue dead-letters after max attempts", async () => {
  const queue = new AsyncTaskQueue({ maxAttempts: 2, retryDelayMs: 1 });
  let deadLettered = false;

  queue.enqueue({
    taskId: "task_dead_letter",
    tenantId: "tenant_A",
    run: async () => {
      throw new Error("permanent_failure");
    },
    onDeadLetter: (record) => {
      deadLettered = true;
      assert.equal(record.task_id, "task_dead_letter");
      assert.equal(record.tenant_id, "tenant_A");
      assert.equal(record.attempts, 2);
      assert.match(record.error, /permanent_failure/);
    },
  });

  await delay(40);
  assert.equal(deadLettered, true);
  assert.equal(queue.listDeadLetters().length, 1);
  assert.equal(queue.listDeadLettersByTenant("tenant_A").length, 1);
  assert.equal(queue.listDeadLettersByTenant("tenant_B").length, 0);
});

test("async queue persists dead letters when store path is configured", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-dlq-"));
  const storePath = join(tempDir, "dead-letters.json");

  try {
    const queueA = new AsyncTaskQueue({
      maxAttempts: 1,
      retryDelayMs: 1,
      deadLetterStorePath: storePath,
    });
    queueA.enqueue({
      taskId: "task_persist_dead_letter",
      tenantId: "tenant_A",
      run: async () => {
        throw new Error("persisted_failure");
      },
      onDeadLetter: () => {},
    });

    await delay(20);
    assert.equal(queueA.listDeadLetters().length, 1);

    const queueB = new AsyncTaskQueue({
      deadLetterStorePath: storePath,
    });
    const restored = queueB.listDeadLetters();
    assert.equal(restored.length, 1);
    assert.equal(restored[0].task_id, "task_persist_dead_letter");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("async queue trims dead letters to retention limit", async () => {
  const queue = new AsyncTaskQueue({
    maxAttempts: 1,
    retryDelayMs: 1,
    maxDeadLetters: 2,
  });

  for (const taskId of ["task_dlq_1", "task_dlq_2", "task_dlq_3"]) {
    queue.enqueue({
      taskId,
      run: async () => {
        throw new Error("always_fail");
      },
      onDeadLetter: () => {},
    });
  }

  await delay(40);
  const deadLetters = queue.listDeadLetters();
  assert.equal(deadLetters.length, 2);
  assert.equal(deadLetters[0].task_id, "task_dlq_2");
  assert.equal(deadLetters[1].task_id, "task_dlq_3");
});

test("async queue applies deterministic retry delay when jitter is disabled", async () => {
  const queue = new AsyncTaskQueue({
    maxAttempts: 2,
    retryDelayMs: 10,
    maxRetryDelayMs: 10,
    retryJitterRatio: 0,
  });
  const attemptTimes: number[] = [];

  queue.enqueue({
    taskId: "task_no_jitter_delay",
    run: async () => {
      attemptTimes.push(Date.now());
      if (attemptTimes.length === 1) {
        throw new Error("transient_failure");
      }
    },
    onDeadLetter: () => {
      throw new Error("should_not_dead_letter");
    },
  });

  await delay(50);
  assert.equal(attemptTimes.length, 2);
  assert.ok(attemptTimes[1] - attemptTimes[0] >= 8);
});

test("async queue caps exponential backoff at max retry delay", async () => {
  const queue = new AsyncTaskQueue({
    maxAttempts: 4,
    retryDelayMs: 2,
    maxRetryDelayMs: 3,
    retryJitterRatio: 0,
  });
  const attemptTimes: number[] = [];
  let deadLettered = false;

  queue.enqueue({
    taskId: "task_capped_backoff",
    run: async () => {
      attemptTimes.push(Date.now());
      throw new Error("always_fail");
    },
    onDeadLetter: () => {
      deadLettered = true;
    },
  });

  await delay(80);
  assert.equal(deadLettered, true);
  assert.equal(attemptTimes.length, 4);
  assert.ok(attemptTimes[2] - attemptTimes[1] >= 2);
  assert.ok(attemptTimes[3] - attemptTimes[2] >= 2);
});

test("async queue rejects enqueue when max queue depth is exceeded", () => {
  const queue = new AsyncTaskQueue({
    maxConcurrent: 1,
    maxQueueDepth: 1,
  });
  const never = new Promise<void>(() => {});

  const first = queue.enqueue({
    taskId: "task_queue_cap_1",
    run: async () => never,
    onDeadLetter: () => {},
  });
  const second = queue.enqueue({
    taskId: "task_queue_cap_2",
    run: async () => never,
    onDeadLetter: () => {},
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, "queue_full");
});

test("async queue stats expose concurrency and capacity fields", () => {
  const queue = new AsyncTaskQueue({
    maxConcurrent: 3,
    maxConcurrentPerTenant: 2,
    maxQueueDepth: 42,
  });
  const stats = queue.getStats();
  assert.equal(stats.max_concurrent, 3);
  assert.equal(stats.max_concurrent_per_tenant, 2);
  assert.equal(stats.max_queue_depth, 42);
  assert.equal(typeof stats.inflight, "number");
});
