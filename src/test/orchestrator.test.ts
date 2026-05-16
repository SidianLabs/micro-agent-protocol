import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createReferenceApp } from "../app.js";
import { createExampleAgents } from "../fixtures/agents.js";

const app = createReferenceApp({ agents: createExampleAgents() });

test("orchestrator dispatches db read successfully", async () => {
  const outcome = await app.orchestrator.dispatch(
    {
      task_id: "task_db",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
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

  assert.equal(outcome.result.status, "completed");
  assert.equal(outcome.receipt.agent_id, "dbread-agent-v1");
});

test("orchestrator negotiates preferred schema version when none is requested", async () => {
  const outcome = await app.orchestrator.dispatch(
    {
      task_id: "task_schema_default",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
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

  assert.equal(outcome.result.status, "completed");
  assert.equal(outcome.result.structured_output.environment, "staging");
});

test("orchestrator rejects unsupported requested schema version", async () => {
  await assert.rejects(
    app.orchestrator.dispatch(
      {
        task_id: "task_schema_unsupported",
        requester_identity: { type: "user", id: "user_1" },
        target_agent: "payment-agent-v1",
        intent: "Execute payment",
        constraints: {
          common: {
            resource_id: "vendor_abc",
            currency: "INR",
            max_amount: 450,
          },
          domain: {
            invoice_id: "INV-223",
            approved_vendor_only: true,
          },
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary",
      },
      "payment.execute",
      "9.9.9",
    ),
    /Unsupported schema version/,
  );
});

test("orchestrator records provider-translated schema versions", async () => {
  const outcome = await app.orchestrator.dispatch(
    {
      task_id: "task_schema_translated",
      requester_identity: { type: "user", id: "user_1" },
      target_agent: "payment-agent-v1",
      intent: "Execute payment",
      constraints: {
        common: {
          resource_id: "vendor_abc",
          currency: "INR",
          max_amount: 450,
        },
        domain: {
          invoice_id: "INV-223",
          approved_vendor_only: true,
        },
      },
      risk_class: "high",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
    "payment.execute",
    "1.0.0",
  );

  assert.equal(outcome.result.requested_schema_version, "1.0.0");
  assert.equal(outcome.result.executed_schema_version, "1.1.0");
  assert.equal(outcome.receipt.requested_schema_version, "1.0.0");
  assert.equal(outcome.receipt.executed_schema_version, "1.1.0");
  assert.deepEqual(outcome.result.negotiation, {
    requested: {
      schema_version: "1.0.0",
      output_mode: "summary",
      delivery_mode: "sync",
    },
    selected: {
      schema_version: "1.1.0",
      output_mode: "summary",
      delivery_mode: "sync",
    },
    provider_actions: ["schema_translated"],
  });
  assert.deepEqual(outcome.receipt.negotiation, outcome.result.negotiation);
});

test("orchestrator supports negotiated async delivery mode", async () => {
  const outcome = await app.orchestrator.dispatch(
    {
      task_id: "task_negotiated_async",
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary",
      constraints: {
        common: {
          environment: "staging",
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
    undefined,
    { delivery_mode: "async" },
  );

  assert.equal(outcome.result.status, "running");
  assert.equal(outcome.result.negotiation?.requested.delivery_mode, "async");
  assert.equal(outcome.result.negotiation?.selected.delivery_mode, "async");
});

test("orchestrator rejects unsupported output mode for target agent", async () => {
  await assert.rejects(
    app.orchestrator.dispatch(
      {
        task_id: "task_output_mode_bad",
        requester_identity: { type: "user", id: "engineer_1" },
        target_agent: "dbread-agent-v1",
        intent: "Fetch incident summary",
        constraints: {
          common: {
            environment: "staging",
            redaction_level: "basic",
          },
          domain: {
            dataset: "incident_metrics",
            service: "payments",
          },
        },
        risk_class: "medium",
        delegation_token: "placeholder",
        requested_output_mode: "debug",
      },
      "db.read.aggregate",
    ),
    /Unsupported output mode/,
  );
});

test("orchestrator rejects unknown agent capability", async () => {
  await assert.rejects(
    app.orchestrator.dispatch(
      {
        task_id: "task_missing",
        requester_identity: { type: "user", id: "user_1" },
        target_agent: "missing-agent",
        intent: "Unknown task",
        constraints: { common: {}, domain: {} },
        risk_class: "low",
        delegation_token: "placeholder",
        requested_output_mode: "summary",
      },
      "missing.capability",
    ),
    /No micro-agent found/,
  );
});

test("orchestrator rejects capability not supported by target agent", async () => {
  await assert.rejects(
    app.orchestrator.dispatch(
      {
        task_id: "task_wrong_agent_capability",
        requester_identity: { type: "user", id: "user_1" },
        target_agent: "dbread-agent-v1",
        intent: "Try payment execute on db agent",
        constraints: {
          common: {
            resource_id: "vendor_abc",
            currency: "INR",
            max_amount: 450,
          },
          domain: {
            invoice_id: "INV-223",
            approved_vendor_only: true,
          },
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary",
      },
      "payment.execute",
    ),
    /Capability not supported/,
  );
});

test("orchestrator rejects dispatch when target agent is disabled", async () => {
  const localApp = createReferenceApp({ agents: createExampleAgents() });
  const descriptor = localApp.registry.get("dbread-agent-v1");
  assert.ok(descriptor);
  const {
    descriptor_signature: _descriptorSignature,
    descriptor_key_id: _descriptorKeyId,
    descriptor_signature_alg: _descriptorSignatureAlg,
    ...unsignedDescriptor
  } = descriptor;
  localApp.registry.register({
    ...unsignedDescriptor,
    registry_status: "disabled",
  });

  await assert.rejects(
    localApp.orchestrator.dispatch(
      {
        task_id: "task_disabled_agent",
        requester_identity: { type: "user", id: "engineer_1" },
        target_agent: "dbread-agent-v1",
        intent: "Fetch incident summary",
        constraints: {
          common: {
            environment: "staging",
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
    ),
    /disabled in registry/,
  );
});

test("orchestrator rejects dispatch when capability is disabled", async () => {
  const localApp = createReferenceApp({ agents: createExampleAgents() });
  const descriptor = localApp.registry.get("dbread-agent-v1");
  assert.ok(descriptor);
  const {
    descriptor_signature: _descriptorSignature,
    descriptor_key_id: _descriptorKeyId,
    descriptor_signature_alg: _descriptorSignatureAlg,
    ...unsignedDescriptor
  } = descriptor;
  localApp.registry.register({
    ...unsignedDescriptor,
    capability_descriptors: (
      unsignedDescriptor.capability_descriptors ?? []
    ).map((item) =>
      item.name === "db.read.aggregate"
        ? { ...item, status: "disabled" }
        : item,
    ),
  });

  await assert.rejects(
    localApp.orchestrator.dispatch(
      {
        task_id: "task_disabled_capability",
        requester_identity: { type: "user", id: "engineer_1" },
        target_agent: "dbread-agent-v1",
        intent: "Fetch incident summary",
        constraints: {
          common: {
            environment: "staging",
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
    ),
    /Capability is disabled/,
  );
});

test("orchestrator returns awaiting_approval for production db read", async () => {
  const outcome = await app.orchestrator.dispatch(
    {
      task_id: "task_db_prod",
      requester_identity: { type: "user", id: "engineer_1" },
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
  assert.equal(outcome.result.followup_required, true);
  assert.match(outcome.result.summary ?? "", /require approval/i);
});

test("orchestrator resumes approval-gated task after approval", async () => {
  const paused = await app.orchestrator.dispatch(
    {
      task_id: "task_db_resume",
      requester_identity: { type: "user", id: "engineer_1" },
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

  const resumed = await app.orchestrator.approve({
    task_id: "task_db_resume",
    approval_reference: String(
      paused.result.structured_output.approval_reference ??
        "approval:task_db_resume",
    ),
    capability: "db.read.aggregate",
    envelope: {
      task_id: "task_db_resume",
      requester_identity: { type: "user", id: "engineer_1" },
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

  assert.equal(resumed.result.status, "completed");
  assert.equal(resumed.receipt.approval_used, "approval:task_db_resume");
});

test("orchestrator rejects approval when task is not awaiting approval", async () => {
  await assert.rejects(
    app.orchestrator.approve({
      task_id: "task_direct_approve_reject",
      approval_reference: "approval:task_direct_approve_reject",
      capability: "db.read.aggregate",
      envelope: {
        task_id: "task_direct_approve_reject",
        requester_identity: { type: "user", id: "engineer_1" },
        target_agent: "dbread-agent-v1",
        intent: "Direct approve without pause",
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
    }),
    /Approval task not found|not awaiting approval/,
  );
});

test("orchestrator returns running for async task and later completes it", async () => {
  const taskId = "task_async_runtime";
  const outcome = await app.orchestrator.dispatch(
    {
      task_id: taskId,
      requester_identity: { type: "user", id: "engineer_1" },
      target_agent: "dbread-agent-v1",
      intent: "Fetch incident summary asynchronously",
      constraints: {
        common: {
          environment: "staging",
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
      metadata: {
        async: true,
      },
    },
    "db.read.aggregate",
  );

  assert.equal(outcome.result.status, "running");

  await delay(0);
  const stored = app.orchestrator.getTask(taskId);
  assert.equal(stored?.status, "completed");
});
