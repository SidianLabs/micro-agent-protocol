import test from "node:test";
import assert from "node:assert/strict";
import { PaymentAgent } from "../src/runtime/payment-agent.js";
import { signDelegationToken } from "../src/security/signing.js";

const agent = new PaymentAgent();

test("micro-agent rejects expired delegation token", async () => {
  const unsignedToken = {
    issuer: "map-test",
    subject_agent: "payment-agent-v1",
    allowed_actions: ["payment.execute"],
    resource_scope: {},
    requester_identity: {
      type: "user" as const,
      id: "user_1"
    },
    constraints: {
      common: {},
      domain: {},
      expires_at: "2020-01-01T00:00:00.000Z"
    }
  };

  await assert.rejects(
    agent.invoke(
      {
        task_id: "task_expired",
        requester_identity: { type: "user", id: "user_1" },
        target_agent: "payment-agent-v1",
        intent: "Pay vendor",
        constraints: {
          common: {
            resource_id: "vendor_1",
            currency: "INR",
            max_amount: 10
          },
          domain: {
            invoice_id: "INV-1",
            approved_vendor_only: true
          }
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      },
      {
        ...unsignedToken,
        signature: signDelegationToken(unsignedToken)
      }
    ),
    /expired or invalid/
  );
});

test("micro-agent rejects invalid delegation token signature", async () => {
  await assert.rejects(
    agent.invoke(
      {
        task_id: "task_invalid_sig",
        requester_identity: { type: "user", id: "user_1" },
        target_agent: "payment-agent-v1",
        intent: "Pay vendor",
        constraints: {
          common: {
            resource_id: "vendor_1",
            currency: "INR",
            max_amount: 10
          },
          domain: {
            invoice_id: "INV-1",
            approved_vendor_only: true
          }
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary"
      },
      {
        issuer: "map-test",
        subject_agent: "payment-agent-v1",
        allowed_actions: ["payment.execute"],
        resource_scope: {},
        constraints: {
          common: {},
          domain: {},
          expires_at: "2099-01-01T00:00:00.000Z"
        },
        signature: "invalid.signature.value"
      }
    ),
    /signature is invalid/
  );
});

test("micro-agent rejects token action not in allowed_actions", async () => {
  const unsignedToken = {
    issuer: "map-test",
    subject_agent: "payment-agent-v1",
    allowed_actions: ["payment.refund"],
    resource_scope: {
      common: {
        resource_id: "vendor_1",
        currency: "INR",
        max_amount: 10
      },
      domain: {
        invoice_id: "INV-1",
        approved_vendor_only: true
      }
    },
    constraints: {
      common: {},
      domain: {},
      expires_at: "2099-01-01T00:00:00.000Z"
    }
  };

  await assert.rejects(
    agent.invoke(
      {
        task_id: "task_action_scope",
        requester_identity: { type: "user", id: "user_1" },
        target_agent: "payment-agent-v1",
        intent: "Pay vendor",
        constraints: {
          common: {
            resource_id: "vendor_1",
            currency: "INR",
            max_amount: 10
          },
          domain: {
            invoice_id: "INV-1",
            approved_vendor_only: true
          }
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary",
        metadata: {
          capability: "payment.execute"
        }
      },
      {
        ...unsignedToken,
        signature: signDelegationToken(unsignedToken)
      }
    ),
    /does not allow action/
  );
});

test("micro-agent rejects token replay", async () => {
  const unsignedToken = {
    issuer: "map-test",
    subject_agent: "payment-agent-v1",
    allowed_actions: ["payment.execute"],
    resource_scope: {
      common: {
        resource_id: "vendor_1",
        currency: "INR",
        max_amount: 10
      },
      domain: {
        invoice_id: "INV-1",
        approved_vendor_only: true
      }
    },
    constraints: {
      common: {},
      domain: {},
      expires_at: "2099-01-01T00:00:00.000Z"
    },
    requester_identity: {
      type: "user" as const,
      id: "user_1"
    }
  };
  const signed = {
    ...unsignedToken,
    signature: signDelegationToken(unsignedToken)
  };

  const envelope = {
    task_id: "task_replay",
    requester_identity: { type: "user", id: "user_1" } as const,
    target_agent: "payment-agent-v1",
    intent: "Pay vendor",
    constraints: {
      common: {
        resource_id: "vendor_1",
        currency: "INR",
        max_amount: 10
      },
      domain: {
        invoice_id: "INV-1",
        approved_vendor_only: true
      }
    },
    risk_class: "high" as const,
    delegation_token: "placeholder",
    requested_output_mode: "summary" as const,
    metadata: {
      capability: "payment.execute"
    }
  };

  await agent.invoke(envelope, signed);
  await assert.rejects(agent.invoke(envelope, signed), /replay detected/);
});

test("micro-agent rejects token when tenant does not match requester tenant", async () => {
  const unsignedToken = {
    issuer: "map-test",
    subject_agent: "payment-agent-v1",
    allowed_actions: ["payment.execute"],
    resource_scope: {
      common: {
        resource_id: "vendor_1",
        currency: "INR",
        max_amount: 10
      },
      domain: {
        invoice_id: "INV-1",
        approved_vendor_only: true
      }
    },
    constraints: {
      common: {},
      domain: {},
      expires_at: "2099-01-01T00:00:00.000Z"
    },
    requester_identity: {
      type: "user" as const,
      id: "user_1",
      tenant_id: "tenant_A"
    }
  };

  await assert.rejects(
    agent.invoke(
      {
        task_id: "task_tenant_mismatch",
        requester_identity: { type: "user", id: "user_1", tenant_id: "tenant_B" },
        target_agent: "payment-agent-v1",
        intent: "Pay vendor",
        constraints: {
          common: {
            resource_id: "vendor_1",
            currency: "INR",
            max_amount: 10
          },
          domain: {
            invoice_id: "INV-1",
            approved_vendor_only: true
          }
        },
        risk_class: "high",
        delegation_token: "placeholder",
        requested_output_mode: "summary",
        metadata: {
          capability: "payment.execute"
        }
      },
      {
        ...unsignedToken,
        signature: signDelegationToken(unsignedToken)
      }
    ),
    /tenant scope does not match/
  );
});
