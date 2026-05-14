import test from "node:test";
import assert from "node:assert/strict";
import { TaskStore } from "../control-plane/task-store.js";
import { createReferenceApp } from "../app.js";
import { createExampleAgents } from "../../demo/agents/index.js";
import type { ExecutionReceipt, ResultPackage, TaskRecord } from "../types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReceipt(
  taskId: string,
  suffix: string,
  agentId = "dbread-agent-v1",
): ExecutionReceipt {
  return {
    receipt_id: `receipt:${taskId}:${suffix}`,
    task_id: taskId,
    agent_id: agentId,
    action_taken: `db.read.aggregate.${suffix}`,
    resource_touched: "database",
    policy_checks: ["policy_passed"],
    timestamp: new Date().toISOString(),
    result_hash: `sha256:${taskId}:${suffix}`,
    signature: "sig",
  };
}

function makeResult(
  taskId: string,
  status: TaskRecord["status"],
): ResultPackage {
  return {
    task_id: taskId,
    status,
    summary: `Status: ${status}`,
    structured_output: {},
    followup_required: status !== "completed" && status !== "failed",
  };
}

function seedTask(
  store: TaskStore,
  taskId: string,
  status: TaskRecord["status"],
  capability = "db.read.aggregate",
  agentId = "dbread-agent-v1",
): TaskRecord {
  return store.save({
    task_id: taskId,
    requester_identity: { type: "user", id: "engineer_1" },
    capability,
    target_agent: agentId,
    result: makeResult(taskId, status),
    receipt: makeReceipt(taskId, status),
  });
}

// ── Task Double-Completion ───────────────────────────────────────────────────

test("task double-completion: second completion should REJECT (terminal state)", () => {
  const store = new TaskStore();
  seedTask(store, "task_chaos_double", "running");

  store.update("task_chaos_double", {
    status: "completed",
    result: makeResult("task_chaos_double", "completed"),
    receipt: makeReceipt("task_chaos_double", "completed"),
  });

  assert.throws(() => {
    store.update("task_chaos_double", {
      status: "completed",
      result: makeResult("task_chaos_double", "completed"),
      receipt: makeReceipt("task_chaos_double", "completed_2"),
    });
  }, /Terminal task state is immutable/);
});

// ── Approval After Denial ────────────────────────────────────────────────────

test("approval after denial: try to approve a denied task should REJECT", () => {
  const store = new TaskStore();
  seedTask(store, "task_chaos_denied", "denied");

  assert.throws(() => {
    store.update("task_chaos_denied", {
      status: "awaiting_approval",
      result: makeResult("task_chaos_denied", "awaiting_approval"),
      receipt: makeReceipt("task_chaos_denied", "approval_attempt"),
    });
  }, /Terminal task state transition is not allowed/);
});

// ── Cancel During Running ────────────────────────────────────────────────────

test("cancel during running: cancel a running task should succeed (transition to revoked)", () => {
  const store = new TaskStore();
  seedTask(store, "task_chaos_cancel_run", "running");

  const revoked = store.update("task_chaos_cancel_run", {
    status: "revoked",
    result: makeResult("task_chaos_cancel_run", "revoked"),
    receipt: makeReceipt("task_chaos_cancel_run", "revoked"),
  });

  assert.equal(revoked?.status, "revoked");
});

// ── Cancel After Completion ──────────────────────────────────────────────────

test("cancel after completion: cancel a completed task should REJECT (terminal state)", () => {
  const store = new TaskStore();
  seedTask(store, "task_chaos_cancel_done", "running");
  store.update("task_chaos_cancel_done", {
    status: "completed",
    result: makeResult("task_chaos_cancel_done", "completed"),
    receipt: makeReceipt("task_chaos_cancel_done", "completed"),
  });

  assert.throws(() => {
    store.update("task_chaos_cancel_done", {
      status: "revoked",
      result: makeResult("task_chaos_cancel_done", "revoked"),
      receipt: makeReceipt("task_chaos_cancel_done", "revoked_attempt"),
    });
  }, /Terminal task state transition is not allowed/);
});

// ── Concurrent Dispatch ──────────────────────────────────────────────────────

test("concurrent dispatch: 5 simultaneous dispatches with same task_id — at least one succeeds, all results consistent", async () => {
  const app = createReferenceApp({ agents: createExampleAgents() });

  const taskId = "task_chaos_concurrent";
  const envelope = {
    task_id: taskId,
    requester_identity: { type: "user" as const, id: "engineer_1" },
    target_agent: "dbread-agent-v1",
    intent: "Concurrent dispatch test",
    constraints: {
      common: {
        environment: "staging" as const,
        redaction_level: "basic" as const,
      },
      domain: {
        dataset: "incident_metrics",
        service: "payments",
      },
    },
    risk_class: "medium" as const,
    delegation_token: "placeholder",
    requested_output_mode: "summary" as const,
  };

  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      app.orchestrator.dispatch(envelope, "db.read.aggregate"),
    ),
  );

  const fulfilled = results.filter((r) => r.status === "fulfilled").length;

  // At least one dispatch must succeed
  assert.ok(fulfilled >= 1, "at least one dispatch should succeed");

  // All fulfilled results must be consistent (same status, same task_id)
  for (const r of results) {
    if (r.status === "fulfilled") {
      assert.equal(r.value.result.task_id, taskId);
      assert.equal(r.value.result.status, "completed");
    }
  }

  // The final stored task must be in a valid terminal state
  const stored = app.taskStore.get(taskId);
  assert.ok(stored, "task should be stored");
  assert.equal(stored?.status, "completed");
});

// ── Task Store Crash Simulation ──────────────────────────────────────────────

test("task store crash simulation: recreate task with same idempotency key after crash", () => {
  // Simulate a crash by creating a fresh store — data from the first store is "lost"
  const store1 = new TaskStore();
  store1.save({
    task_id: "task_chaos_crash_1",
    requester_identity: { type: "user", id: "engineer_1" },
    idempotency_key: "idem-crash-key",
    capability: "db.read.aggregate",
    target_agent: "dbread-agent-v1",
    result: makeResult("task_chaos_crash_1", "completed"),
    receipt: makeReceipt("task_chaos_crash_1", "completed"),
  });

  // Simulate crash: create a new store instance without the previous data
  const store2 = new TaskStore();

  // Should be able to re-create with the same idempotency key since store2 has no record
  const recreated = store2.save({
    task_id: "task_chaos_crash_1",
    requester_identity: { type: "user", id: "engineer_1" },
    idempotency_key: "idem-crash-key",
    capability: "db.read.aggregate",
    target_agent: "dbread-agent-v1",
    result: makeResult("task_chaos_crash_1", "completed"),
    receipt: makeReceipt("task_chaos_crash_1", "completed"),
  });

  assert.equal(recreated.task_id, "task_chaos_crash_1");
  assert.equal(recreated.status, "completed");
  assert.equal(
    store2.findByIdempotencyKey("idem-crash-key")?.task_id,
    "task_chaos_crash_1",
  );
});

// ── Rapid State Transitions ──────────────────────────────────────────────────

test("rapid state transitions: accepted → proposed → running → completed all succeed", () => {
  const store = new TaskStore();
  const taskId = "task_chaos_rapid";

  // accepted → proposed
  const accepted = seedTask(store, taskId, "accepted");
  assert.equal(accepted.status, "accepted");

  const proposed = store.update(taskId, {
    status: "proposed",
    result: makeResult(taskId, "proposed"),
    receipt: makeReceipt(taskId, "proposed"),
  });
  assert.equal(proposed?.status, "proposed");

  // proposed → running
  const running = store.update(taskId, {
    status: "running",
    result: makeResult(taskId, "running"),
    receipt: makeReceipt(taskId, "running"),
  });
  assert.equal(running?.status, "running");

  // running → completed
  const completed = store.update(taskId, {
    status: "completed",
    result: makeResult(taskId, "completed"),
    receipt: makeReceipt(taskId, "completed"),
  });
  assert.equal(completed?.status, "completed");
});

// ── Invalid Transition: Running → Awaiting Approval ─────────────────────────

test("invalid transition: running → awaiting_approval should REJECT (can't go backward)", () => {
  const store = new TaskStore();
  seedTask(store, "task_chaos_backward", "running");

  assert.throws(() => {
    store.update("task_chaos_backward", {
      status: "awaiting_approval",
      result: makeResult("task_chaos_backward", "awaiting_approval"),
      receipt: makeReceipt("task_chaos_backward", "awaiting_approval"),
    });
  }, /Invalid task state transition/);
});
