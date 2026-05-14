import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../control-plane/task-store.js";

function seedRunningTask(taskStore: TaskStore, taskId: string) {
  taskStore.save({
    task_id: taskId,
    requester_identity: { type: "user", id: "engineer_1" },
    capability: "db.read.aggregate",
    target_agent: "dbread-agent-v1",
    result: {
      task_id: taskId,
      status: "running",
      summary: "running",
      structured_output: {},
      followup_required: true,
    },
    receipt: {
      receipt_id: `receipt:${taskId}:running`,
      task_id: taskId,
      agent_id: "dbread-agent-v1",
      action_taken: "db.read.aggregate.running",
      resource_touched: "database",
      policy_checks: ["policy_passed"],
      timestamp: new Date().toISOString(),
      result_hash: `sha256:${taskId}:running`,
      signature: "sig",
    },
  });
}

test("task store allows valid lifecycle transition running -> completed", () => {
  const taskStore = new TaskStore();
  seedRunningTask(taskStore, "task_ts_ok");

  const updated = taskStore.update("task_ts_ok", {
    status: "completed",
    result: {
      task_id: "task_ts_ok",
      status: "completed",
      summary: "done",
      structured_output: {},
      followup_required: false,
    },
    receipt: {
      receipt_id: "receipt:task_ts_ok:completed",
      task_id: "task_ts_ok",
      agent_id: "dbread-agent-v1",
      action_taken: "db.read.aggregate.completed",
      resource_touched: "database",
      policy_checks: ["policy_passed"],
      timestamp: new Date().toISOString(),
      result_hash: "sha256:task_ts_ok:completed",
      signature: "sig",
    },
  });

  assert.equal(updated?.status, "completed");
});

test("task store rejects invalid lifecycle transition running -> awaiting_approval", () => {
  const taskStore = new TaskStore();
  seedRunningTask(taskStore, "task_ts_invalid");

  assert.throws(() => {
    taskStore.update("task_ts_invalid", {
      status: "awaiting_approval",
    });
  }, /Invalid task state transition/);
});

test("task store rejects terminal transition completed -> failed", () => {
  const taskStore = new TaskStore();
  seedRunningTask(taskStore, "task_ts_terminal");
  taskStore.update("task_ts_terminal", {
    status: "completed",
    result: {
      task_id: "task_ts_terminal",
      status: "completed",
      summary: "done",
      structured_output: {},
      followup_required: false,
    },
    receipt: {
      receipt_id: "receipt:task_ts_terminal:completed",
      task_id: "task_ts_terminal",
      agent_id: "dbread-agent-v1",
      action_taken: "db.read.aggregate.completed",
      resource_touched: "database",
      policy_checks: ["policy_passed"],
      timestamp: new Date().toISOString(),
      result_hash: "sha256:task_ts_terminal:completed",
      signature: "sig",
    },
  });

  assert.throws(() => {
    taskStore.update("task_ts_terminal", {
      status: "failed",
    });
  }, /Terminal task state transition is not allowed/);
});

test("task store rejects terminal result mutation for same completed state", () => {
  const taskStore = new TaskStore();
  seedRunningTask(taskStore, "task_ts_mutate");
  taskStore.update("task_ts_mutate", {
    status: "completed",
    result: {
      task_id: "task_ts_mutate",
      status: "completed",
      summary: "done",
      structured_output: { value: 1 },
      followup_required: false,
    },
    receipt: {
      receipt_id: "receipt:task_ts_mutate:completed",
      task_id: "task_ts_mutate",
      agent_id: "dbread-agent-v1",
      action_taken: "db.read.aggregate.completed",
      resource_touched: "database",
      policy_checks: ["policy_passed"],
      timestamp: new Date().toISOString(),
      result_hash: "sha256:task_ts_mutate:completed",
      signature: "sig",
    },
  });

  assert.throws(() => {
    taskStore.update("task_ts_mutate", {
      status: "completed",
      result: {
        task_id: "task_ts_mutate",
        status: "completed",
        summary: "tampered",
        structured_output: { value: 99 },
        followup_required: false,
      },
    });
  }, /Terminal task state is immutable/);
});

test("task store rejects lifecycle transition when result.status mismatches task status", () => {
  const taskStore = new TaskStore();
  seedRunningTask(taskStore, "task_ts_status_mismatch");

  assert.throws(() => {
    taskStore.update("task_ts_status_mismatch", {
      status: "completed",
      result: {
        task_id: "task_ts_status_mismatch",
        status: "failed",
        summary: "bad state",
        structured_output: {},
        followup_required: false,
      },
      receipt: {
        receipt_id: "receipt:task_ts_status_mismatch:completed",
        task_id: "task_ts_status_mismatch",
        agent_id: "dbread-agent-v1",
        action_taken: "db.read.aggregate.completed",
        resource_touched: "database",
        policy_checks: [],
        timestamp: new Date().toISOString(),
        result_hash: "sha256:task_ts_status_mismatch:completed",
        signature: "sig",
      },
    });
  }, /result\.status must match task status/);
});

test("task store rejects lifecycle transition without result and receipt payload", () => {
  const taskStore = new TaskStore();
  seedRunningTask(taskStore, "task_ts_missing_payloads");

  assert.throws(() => {
    taskStore.update("task_ts_missing_payloads", {
      status: "failed",
    });
  }, /transitions must include result and receipt/);
});

test("task store rejects lifecycle transition when receipt.task_id mismatches task id", () => {
  const taskStore = new TaskStore();
  seedRunningTask(taskStore, "task_ts_receipt_mismatch");

  assert.throws(() => {
    taskStore.update("task_ts_receipt_mismatch", {
      status: "completed",
      result: {
        task_id: "task_ts_receipt_mismatch",
        status: "completed",
        summary: "done",
        structured_output: {},
        followup_required: false,
      },
      receipt: {
        receipt_id: "receipt:task_ts_receipt_mismatch:completed",
        task_id: "task_ts_other",
        agent_id: "dbread-agent-v1",
        action_taken: "db.read.aggregate.completed",
        resource_touched: "database",
        policy_checks: [],
        timestamp: new Date().toISOString(),
        result_hash: "sha256:task_ts_receipt_mismatch:completed",
        signature: "sig",
      },
    });
  }, /receipt\.task_id mismatch/);
});

test("task store persists records with sqlite db path across restarts", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-task-db-"));
  const dbPath = join(tempDir, "tasks.db");

  try {
    const taskStoreA = new TaskStore({ dbPath });
    seedRunningTask(taskStoreA, "task_ts_db");
    taskStoreA.update("task_ts_db", {
      status: "completed",
      result: {
        task_id: "task_ts_db",
        status: "completed",
        summary: "done",
        structured_output: {},
        followup_required: false,
      },
      receipt: {
        receipt_id: "receipt:task_ts_db:completed",
        task_id: "task_ts_db",
        agent_id: "dbread-agent-v1",
        action_taken: "db.read.aggregate.completed",
        resource_touched: "database",
        policy_checks: ["policy_passed"],
        timestamp: new Date().toISOString(),
        result_hash: "sha256:task_ts_db:completed",
        signature: "sig",
      },
    });

    const taskStoreB = new TaskStore({ dbPath });
    const restored = taskStoreB.get("task_ts_db");
    assert.equal(restored?.status, "completed");
    assert.equal(restored?.task_id, "task_ts_db");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("task store indexes idempotency keys and restores them across restart", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "map-task-idem-db-"));
  const dbPath = join(tempDir, "tasks.db");

  try {
    const taskStoreA = new TaskStore({ dbPath });
    taskStoreA.save({
      task_id: "task_idem_store_1",
      requester_identity: {
        type: "user",
        id: "engineer_1",
        tenant_id: "tenant_A",
      },
      idempotency_key: "idem-store-key-1",
      capability: "db.read.aggregate",
      target_agent: "dbread-agent-v1",
      result: {
        task_id: "task_idem_store_1",
        status: "completed",
        summary: "done",
        structured_output: {},
        followup_required: false,
      },
      receipt: {
        receipt_id: "receipt:task_idem_store_1",
        task_id: "task_idem_store_1",
        agent_id: "dbread-agent-v1",
        action_taken: "db.read.aggregate.completed",
        resource_touched: "database",
        policy_checks: ["policy_passed"],
        timestamp: new Date().toISOString(),
        result_hash: "sha256:task_idem_store_1",
        signature: "sig",
      },
    });
    const foundA = taskStoreA.findByIdempotencyKey("idem-store-key-1");
    assert.equal(foundA?.task_id, "task_idem_store_1");

    const taskStoreB = new TaskStore({ dbPath });
    const foundB = taskStoreB.findByIdempotencyKey("idem-store-key-1");
    assert.equal(foundB?.task_id, "task_idem_store_1");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("task store rejects duplicate idempotency keys for different task ids", () => {
  const taskStore = new TaskStore();
  taskStore.save({
    task_id: "task_idem_dup_1",
    requester_identity: { type: "user", id: "engineer_1" },
    idempotency_key: "idem-dup-key",
    capability: "db.read.aggregate",
    target_agent: "dbread-agent-v1",
    result: {
      task_id: "task_idem_dup_1",
      status: "completed",
      structured_output: {},
      followup_required: false,
    },
    receipt: {
      receipt_id: "receipt:task_idem_dup_1",
      task_id: "task_idem_dup_1",
      agent_id: "dbread-agent-v1",
      action_taken: "db.read.aggregate.completed",
      resource_touched: "database",
      policy_checks: [],
      timestamp: new Date().toISOString(),
      result_hash: "hash",
      signature: "sig",
    },
  });

  assert.throws(
    () =>
      taskStore.save({
        task_id: "task_idem_dup_2",
        requester_identity: { type: "user", id: "engineer_1" },
        idempotency_key: "idem-dup-key",
        capability: "db.read.aggregate",
        target_agent: "dbread-agent-v1",
        result: {
          task_id: "task_idem_dup_2",
          status: "completed",
          structured_output: {},
          followup_required: false,
        },
        receipt: {
          receipt_id: "receipt:task_idem_dup_2",
          task_id: "task_idem_dup_2",
          agent_id: "dbread-agent-v1",
          action_taken: "db.read.aggregate.completed",
          resource_touched: "database",
          policy_checks: [],
          timestamp: new Date().toISOString(),
          result_hash: "hash",
          signature: "sig",
        },
      }),
    /Idempotency key already exists/,
  );
});
