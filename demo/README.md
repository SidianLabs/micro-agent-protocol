<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Demo — Build & Run Guide

This folder contains everything you need to run MAP locally and understand how to build your own micro-agents.

## Quick Start

```bash
# 1. From the project root, install dependencies
npm install

# 2. Start the demo server (includes example agents)
npm run dev:demo-server

# You'll see: MAP demo server listening on http://localhost:8787

# 3. In another terminal, run a demo
npm run demo:payment
# or
npm run demo:db-read
```

## What's in This Folder

```
demo/
├── README.md              ← You're reading it
├── server.ts              ← Demo server entry point (starts MAP with example agents)
├── demo-payment.ts        ← Payment flow demo script (acts like an AI assistant's SDK)
├── demo-db-read.ts        ← Database read demo script
└── agents/
    ├── index.ts           ← Re-exports all example agents
    ├── payment-agent.ts   ← Example: PaymentAgent (how to build a payment micro-agent)
    ├── dbread-agent.ts    ← Example: DBReadAgent (how to build a database micro-agent)
    └── generic-agent.ts   ← Example: GenericAgent (template for any custom agent)
```

---

## Architecture: Where Your Code Goes

```
┌─────────────────────────────────────────────┐
│           MAP FRAMEWORK (we provide)         │
│                                             │
│  Server, Orchestrator, Policy, Auth,        │
│  Signing, Delegation, Queue, Audit          │
│                                             │
│  BaseMicroAgent (abstract class)            │
│    │                                        │
│    └── extend this ─────────────────┐       │
│                                     │       │
└─────────────────────────────────────┼───────┘
                                      │
┌─────────────────────────────────────┼───────┐
│        YOUR COMPANY AGENTS           │       │
│                                     ▼       │
│  class MyPaymentAgent extends BaseMicroAgent │
│    → Write execute() with YOUR logic        │
│    → Call YOUR internal APIs                │
│    → Apply YOUR business rules              │
│                                             │
└─────────────────────────────────────────────┘
```

MAP provides **everything up to `BaseMicroAgent`**. You only write `execute()` — your actual business logic. The framework handles auth, policy, signing, receipts, audit, and lifecycle.

---

## How To Build Your Own Agent

### Step 1: Extend `BaseMicroAgent`

```typescript
// my-company/payment-agent.ts
import { BaseMicroAgent } from "micro-agent-protocol";
import type { AgentDescriptor, DelegationToken, InvokeResult, TaskEnvelope } from "micro-agent-protocol";

export class MyBankPaymentAgent extends BaseMicroAgent {

  // Define WHAT your agent is and what it can do
  readonly descriptor: AgentDescriptor = {
    agent_id: "mybank-payment-v1",          // Unique ID
    organization: "my-bank",                 // Your company
    version: "1.0.0",
    domain: "payments",                      // Domain: payments, database, crm, files...
    capabilities: [                          // What actions can it perform?
      "payment.initiate",
      "payment.verify",
      "payment.refund"
    ],
    risk_level: "high",                      // low | medium | high | critical
    input_schema_ref: "schema://mybank/payment/input",
    output_schema_ref: "schema://mybank/payment/output",
    supported_execution_modes: ["propose", "commit"],
    approval_requirements: ["threshold_based", "fraud_check"],
    visibility_modes: ["summary", "structured_only", "receipt_only"],
    policy_hooks: ["fraud_detection", "compliance_check"],
    display_name: "MyBank Payment Agent",
    auth_schemes: ["signed_request"],
    capability_descriptors: [
      {
        name: "payment.initiate",
        execution_mode: "commit",
        request_schema_ref: "schema://mybank/payment/initiate/request",
        response_schema_ref: "schema://mybank/payment/initiate/response",
        auth_schemes: ["signed_request"],
        required_auth_scheme: "signed_request",
        schema_version: "1.0.0",
        supported_schema_versions: ["1.0.0"],
        compatibility: "backward_compatible",
        status: "active"
      }
      // ... add more capabilities
    ],
    tags: ["payments", "banking"],
    registry_status: "active",
    description: "MyBank payment processing micro-agent."
  };

  // Implement YOUR business logic here
  protected async execute(
    envelope: TaskEnvelope,
    token: DelegationToken
  ): Promise<InvokeResult> {

    // 1. Extract data from the envelope
    const common = (envelope.constraints.common ?? {}) as Record<string, unknown>;
    const domain = (envelope.constraints.domain ?? {}) as Record<string, unknown>;
    const amount = Number(common.max_amount ?? 0);
    const currency = String(common.currency ?? "USD");
    const vendorId = String(common.resource_id ?? "unknown");

    // 2. Call YOUR internal systems
    const fraudResult = await this.myFraudService.check({ amount, vendorId });
    if (!fraudResult.safe) {
      return this.buildResult(envelope, "failed", {
        reason: "Fraud check failed",
        details: fraudResult.reasons
      });
    }

    const paymentResult = await this.myPaymentRail.process({
      amount,
      currency,
      vendor: vendorId,
      reference: envelope.task_id
    });

    // 3. Return structured result
    return this.buildResult(envelope, "completed", {
      transaction_id: paymentResult.txnId,
      amount: paymentResult.amount,
      currency: paymentResult.currency,
      status: paymentResult.status
    });
  }

  // Your private methods
  private async myFraudService(data: { amount: number; vendorId: string }) {
    // Call your internal fraud detection API
    return { safe: true, reasons: [] };
  }

  private async myPaymentRail(data: Record<string, unknown>) {
    // Call your actual payment processor
    return { txnId: "txn-123", amount: 500, currency: "USD", status: "success" };
  }
}
```

### Step 2: Register Your Agent

```typescript
// my-company/server.ts
import { createMapServer } from "micro-agent-protocol";
import { MyBankPaymentAgent } from "./payment-agent.js";

const myPaymentAgent = new MyBankPaymentAgent();

const server = createMapServer({
  agents: [myPaymentAgent],          // ← your agents go here
  deploymentProfile: "verified",     // open | verified | regulated
  requireTenant: true,
  enforceSignedRequests: true,
  taskStorePath: ".map/tasks.json",
  receiptStorePath: ".map/receipts.json"
});

server.listen(8787, () => {
  console.log("MyBank MAP server running on http://localhost:8787");
  console.log(`Registered agents: ${myPaymentAgent.descriptor.agent_id}`);
});
```

### Step 3: Start and Test

```bash
# Start your server
npx tsx my-company/server.ts

# In another terminal, send a test dispatch
curl -X POST http://localhost:8787/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "payment.initiate",
    "envelope": {
      "task_id": "test-001",
      "requester_identity": { "type": "user", "id": "user_1", "tenant_id": "mybank" },
      "target_agent": "mybank-payment-v1",
      "intent": "Pay vendor for services",
      "constraints": {
        "common": { "max_amount": 500, "currency": "USD", "resource_id": "vendor_abc" }
      },
      "risk_class": "medium",
      "delegation_token": "placeholder",
      "requested_output_mode": "summary"
    }
  }'
```

---

## How Policy Works

The policy engine (`DefaultPolicyEngine`) evaluates every dispatch before execution. You can customize it or build your own:

| Rule | Example |
|---|---|
| **Risk level** | `critical` → always requires approval |
| **Domain rules** | `payments` + no `approved_vendor_only` → deny |
| **Amount thresholds** | `payments` + amount > $1000 → require approval |
| **Environment** | `database` + `production` → require approval |
| **Tenant** | Missing `tenant_id` when `requireTenant: true` → deny |

To build a custom policy engine:

```typescript
class MyBankPolicyEngine implements PolicyEngine {
  evaluate(context: PolicyContext): PolicyDecision {
    // Your custom rules here
    if (context.descriptor.domain === "payments" && !this.isBusinessHours()) {
      return { allowed: false, action: "deny", policy_checks: ["business_hours_only"] };
    }
    return { allowed: true, action: "allow", policy_checks: ["policy_passed"] };
  }
}
```

---

## Auth Flow

```
AI Assistant's SDK                    Your MAP Server
     │                                      │
     │  1. POST /dispatch                   │
     │  x-map-auth-scheme: signed_request   │
     │  x-map-key-id: my-key-1              │
     │  x-map-timestamp: 2026-...           │
     │  x-map-request-signature: eyJ...     │
     │  x-map-nonce: abc123                 │
     │─────────────────────────────────────→│
     │                                      │ 2. Verify signature (JWS MAPSIG)
     │                                      │ 3. Verify nonce (not replayed)
     │                                      │ 4. Verify timestamp (within 5 min)
     │                                      │
     │  5. 200 { result, receipt }         │
     │←─────────────────────────────────────│
```

---

## Lifecycle of a Task

```
POST /dispatch
     │
     ▼
  accepted ──→ proposed ──→ ┌── denied (policy rejected)
                 │          ├── awaiting_approval ──→ POST /approve ──→ running
                 │          │                     └── POST /cancel ──→ revoked
                 │          └── running (sync or async)
                 │                    │
                 ▼                    ▼
            completed / failed    completed / failed
                 │                    │
                 ▼                    ▼
            POST /cancel ──────→ revoked
```

---

## Key Concepts

| Concept | What It Is |
|---|---|
| **AgentDescriptor** | Self-describing metadata — what the agent IS, what capabilities it has |
| **TaskEnvelope** | The request wrapper — who is asking, what they want, constraints |
| **DelegationToken** | Signed authorization — proves the orchestrator authorized this execution |
| **PolicyDecision** | allow / deny / require_approval — the policy engine's verdict |
| **ResultPackage** | What the agent returns — status, summary, output, visibility |
| **ExecutionReceipt** | Cryptographic proof — signed record of what happened |
| **VisibilityMode** | Controls what goes back to the AI — full/summary/redacted/receipt_only |
| **DeliveryMode** | sync (immediate) or async (queued) execution |

---

## The Two Example Agents Explained

### PaymentAgent (`agents/payment-agent.ts`)
- Domain: `payments`
- Capabilities: `payment.propose`, `payment.execute`, `payment.refund`
- Shows: approval thresholds ($1000+), vendor validation, invoice matching
- Risk: `high` — critical capabilities require approval by default

### DBReadAgent (`agents/dbread-agent.ts`)
- Domain: `database`
- Capabilities: `db.read.query`, `db.read.lookup`, `db.read.aggregate`
- Shows: environment-based policy (production needs approval), visibility modes (redaction)
- Risk: `medium` — production reads require approval

### GenericAgent (`agents/generic-agent.ts`)
- A minimal template you can copy to start building your own agent
- Shows the bare minimum: descriptor + execute()

---

## Next Steps

1. **Run the demo**: `npm run dev:demo-server` + `npm run demo:payment`
2. **Read the example agents**: Start with `generic-agent.ts`, then `payment-agent.ts`
3. **Copy and customize**: Copy `generic-agent.ts`, change the `descriptor` and `execute()`
4. **Read the protocol spec**: `protocol/map-types.ts` and `schemas/openapi.yaml`
5. **Build your own**: Create your agent class, register it, start the server
