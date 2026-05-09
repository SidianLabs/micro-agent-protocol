import test from "node:test";
import assert from "node:assert/strict";
import { DefaultPolicyEngine } from "../src/control-plane/policy.js";
import type { AgentDescriptor, TaskEnvelope } from "../src/types.js";

const engine = new DefaultPolicyEngine();

const paymentDescriptor: AgentDescriptor = {
  agent_id: "payment-agent-v1",
  organization: "example-corp",
  version: "1.0.0",
  domain: "payments",
  capabilities: ["payment.execute"],
  risk_level: "high",
  input_schema_ref: "schema://payment/input",
  output_schema_ref: "schema://payment/output",
  supported_execution_modes: ["commit"],
  visibility_modes: ["summary"]
};

const dbDescriptor: AgentDescriptor = {
  agent_id: "dbread-agent-v1",
  organization: "example-corp",
  version: "1.0.0",
  domain: "database",
  capabilities: ["db.read.aggregate"],
  risk_level: "medium",
  input_schema_ref: "schema://db/input",
  output_schema_ref: "schema://db/output",
  supported_execution_modes: ["read"],
  visibility_modes: ["summary"]
};

function makeEnvelope(constraints: Record<string, unknown>): TaskEnvelope {
  return {
    task_id: "task_1",
    requester_identity: { type: "user", id: "user_1" },
    target_agent: "agent",
    intent: "test",
    constraints,
    risk_class: "medium",
    delegation_token: "placeholder",
    requested_output_mode: "summary"
  };
}

test("policy allows safe payment under threshold", () => {
  const decision = engine.evaluate({
    descriptor: paymentDescriptor,
    envelope: makeEnvelope({
      common: { max_amount: 100 },
      domain: { approved_vendor_only: true }
    })
  });

  assert.equal(decision.action, "allow");
  assert.equal(decision.allowed, true);
});

test("policy denies payment without approved vendor", () => {
  const decision = engine.evaluate({
    descriptor: paymentDescriptor,
    envelope: makeEnvelope({
      common: { max_amount: 100 },
      domain: { approved_vendor_only: false }
    })
  });

  assert.equal(decision.action, "deny");
  assert.equal(decision.allowed, false);
  assert.match(decision.reason ?? "", /approved vendors/i);
});

test("policy requires approval for payment above threshold", () => {
  const decision = engine.evaluate({
    descriptor: paymentDescriptor,
    envelope: makeEnvelope({
      common: { max_amount: 4500 },
      domain: { approved_vendor_only: true }
    })
  });

  assert.equal(decision.action, "require_approval");
  assert.equal(decision.allowed, false);
});

test("policy requires approval for production database reads", () => {
  const decision = engine.evaluate({
    descriptor: dbDescriptor,
    envelope: makeEnvelope({
      common: { environment: "production" },
      domain: {}
    })
  });

  assert.equal(decision.action, "require_approval");
  assert.equal(decision.allowed, false);
});

test("policy denies request when tenant is required but missing", () => {
  const strictEngine = new DefaultPolicyEngine({ requireTenant: true });
  const decision = strictEngine.evaluate({
    descriptor: dbDescriptor,
    envelope: makeEnvelope({
      common: { environment: "staging" },
      domain: {}
    })
  });

  assert.equal(decision.action, "deny");
  assert.equal(decision.allowed, false);
  assert.match(decision.reason ?? "", /tenant_id is required/i);
});

test("policy allows request when tenant is required and present", () => {
  const strictEngine = new DefaultPolicyEngine({ requireTenant: true });
  const envelope = makeEnvelope({
    common: { environment: "staging" },
    domain: {}
  });
  envelope.requester_identity.tenant_id = "tenant_A";

  const decision = strictEngine.evaluate({
    descriptor: dbDescriptor,
    envelope
  });

  assert.equal(decision.action, "allow");
  assert.equal(decision.allowed, true);
});
