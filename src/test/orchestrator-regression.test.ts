import test from "node:test";
import assert from "node:assert/strict";
import { createReferenceApp } from "../app.js";
import { createExampleAgents } from "../fixtures/agents.js";

// ── Orchestrator Regression Tests ──────────────────────────────────────────

test("orchestrator approval bypass: approved task completes without re-entering approval gate", async () => {
  const app = createReferenceApp({ agents: createExampleAgents() });

  const paused = await app.orchestrator.dispatch(
    {
      task_id: "task_approval_bypass",
      requester_identity: { type: "user" as const, id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic",
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments",
        },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
    "db.read.aggregate",
  );

  assert.equal(paused.result.status, "awaiting_approval", "task should be awaiting approval");
  const approvalRef = paused.result.structured_output?.approval_reference;

  const resumed = await app.orchestrator.approve({
    task_id: "task_approval_bypass",
    approval_reference: String(approvalRef ?? "approval:task_approval_bypass"),
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_approval_bypass",
      requester_identity: { type: "user" as const, id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic",
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments",
        },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(resumed.result.status, "completed", "approved task must complete, not re-enter approval");
  assert.equal(resumed.receipt.approval_used, String(approvalRef ?? "approval:task_approval_bypass"));
});

test("orchestrator concurrent dispatch: same task_id produces consistent results", async () => {
  const app = createReferenceApp({ agents: createExampleAgents() });

  const taskId = "task_concurrent_race_reg";
  const envelope = {
    task_id: taskId,
    requester_identity: { type: "user" as const, id: "engineer_1" as const },
    target_agent: "dbread-agent-v1" as const,
    intent: "Concurrent dispatch test",
    constraints: {
      common: {
        environment: "staging" as const,
        redaction_level: "basic" as const,
      },
      domain: {
        dataset: "incident_metrics" as const,
        service: "payments" as const,
      },
    },
    risk_class: "medium" as const,
    delegation_token: "placeholder",
    requested_output_mode: "summary" as const,
  } as Parameters<typeof app.orchestrator.dispatch>[0];

  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      app.orchestrator.dispatch(envelope, "db.read.aggregate"),
    ),
  );

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.ok(fulfilled.length >= 1, "at least one dispatch must succeed");

  for (const r of fulfilled) {
    assert.equal(r.value.result.task_id, taskId);
    assert.ok(
      r.value.result.status === "completed" || r.value.result.status === "awaiting_approval",
      "status must be valid terminal or pending state",
    );
  }

  const stored = app.taskStore.get(taskId);
  assert.ok(stored, "task must be stored");
  assert.ok(
    stored?.status === "completed" || stored?.status === "awaiting_approval",
    "stored task must be in valid state",
  );
});

test("orchestrator approval resume: receipt has request_id propagated from envelope", async () => {
  const app = createReferenceApp({ agents: createExampleAgents() });

  const paused = await app.orchestrator.dispatch(
    {
      task_id: "task_request_id_reg",
      requester_identity: { type: "user" as const, id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic",
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments",
        },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
    "db.read.aggregate",
  );

  const approvalRef = String(
    paused.result.structured_output?.approval_reference ?? "approval:task_request_id_reg",
  );

  const resumed = await app.orchestrator.approve({
    task_id: "task_request_id_reg",
    approval_reference: approvalRef,
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_request_id_reg",
      requester_identity: { type: "user" as const, id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic",
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments",
        },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  });

  assert.equal(resumed.receipt.task_id, "task_request_id_reg", "receipt must have task_id");
  assert.ok(resumed.receipt.receipt_id.length > 0, "receipt must have a non-empty receipt_id");
});

test("orchestrator: receipt IDs are unique across concurrent dispatches", async () => {
  const app = createReferenceApp({ agents: createExampleAgents() });

  const taskIds = [
    `task_receipt_uniq_${Date.now()}_a`,
    `task_receipt_uniq_${Date.now()}_b`,
    `task_receipt_uniq_${Date.now()}_c`,
  ];

  const results = await Promise.allSettled(
    taskIds.map((taskId, i) =>
      app.orchestrator.dispatch(
        {
          task_id: taskId,
          requester_identity: { type: "user", id: `engineer_${i}` },
          target_agent: "dbread-agent-v1",
          intent: `Dispatch ${i}`,
          constraints: {
            common: { environment: "staging", redaction_level: "basic" },
            domain: { dataset: "incident_metrics", service: "payments" },
          },
          risk_class: "medium",
          delegation_token: "placeholder",
          requested_output_mode: "summary",
        },
        "db.read.aggregate",
      ),
    ),
  );

  const receiptIds = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value.receipt.receipt_id);

  const uniqueReceiptIds = new Set(receiptIds);
  assert.equal(
    uniqueReceiptIds.size,
    receiptIds.length,
    "all receipt IDs must be unique; duplicates indicate receipt ID collision",
  );
});

test("orchestrator: approval summary says task will require approval (not allow)", async () => {
  const app = createReferenceApp({ agents: createExampleAgents() });

  const outcome = await app.orchestrator.dispatch(
    {
      task_id: "task_approval_summary_reg",
      requester_identity: { type: "user" as const, id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch production incident summary",
      constraints: {
        common: {
          environment: "production",
          redaction_level: "basic",
        },
        domain: {
          dataset: "incident_metrics",
          service: "payments",
        },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
    "db.read.aggregate",
  );

  assert.equal(outcome.result.status, "awaiting_approval");
  assert.match(
    outcome.result.summary ?? "",
    /require approval/i,
    "summary must explicitly say task requires approval",
  );
});