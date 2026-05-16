<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP — Micro Agent Protocol

**Policy enforcement and audit trails for AI agents. Works for any action. Open standard.**

```
AI proposes → MAP checks policy → Allowed: execute + receipt | Blocked: deny | Risky: require approval
```

MAP is a **firewall for AI actions**. Whatever your AI agent wants to do — send emails, write to databases, call APIs, deploy infrastructure, process payments, update records — MAP enforces your rules and generates a signed receipt for every decision.

---

## 10-minute setup

```bash
npm install @sidianlabs/map-sdk
```

```typescript
import { map } from '@sidianlabs/map-sdk';

// Works for ANY action your AI agent takes
const agent = map({
  policy: [
    // Payments: require approval above $1000
    { when: 'payment.*',   amount_gt: 1000,    require: 'approval' },

    // Database: block all writes to production
    { when: 'db.write',    env: 'production',  require: 'deny'     },

    // Infrastructure: always require approval
    { when: 'aws.*',       env: 'production',  require: 'approval' },

    // Email: require approval for bulk sends
    { when: 'email.send',  amount_gt: 100,     require: 'approval' },

    // Everything else: allow
    { when: '*',                               require: 'allow'    },
  ],
  onApprovalRequired: async ({ capability, approve }) => {
    const ok = await askHuman(`Approve ${capability}?`);
    if (ok) await approve();
  },
});

// Register handlers for whatever your agent does
agent.can('payment.execute', async (input) => {
  return await stripe.charges.create({ amount: input.amount });
});

agent.can('db.write', async (input) => {
  return await db.query(input.sql, input.params);
});

agent.can('email.send', async (input) => {
  return await sendgrid.send({ to: input.to, subject: input.subject });
});

agent.can('aws.ec2_start', async (input) => {
  return await ec2.startInstances({ InstanceIds: [input.instance_id] });
});

// Run any capability — MAP enforces your policy automatically
const result = await agent.run('payment.execute', {
  amount: 5000,
  currency: 'USD',
  vendor_id: 'vendor_abc',
});

// result.status  → 'executed' | 'denied' | 'approval_required'
// result.output  → whatever your handler returned
// result.receipt → cryptographically signed proof of what happened
```

That's it. No `TaskEnvelope`. No `AgentDescriptor`. No `DelegationToken`. Just policy, handlers, and receipts.

---

## The problem MAP solves

AI agents are being deployed into production systems — payments, databases, HR, healthcare, infrastructure, customer data — with almost no control layer between the AI and the action.

When you give an AI assistant access to tools, the AI becomes the effective superuser over everything it can reach. If it's manipulated via prompt injection, confused by context, or just wrong, it executes the action anyway. There is no enforced checkpoint.

Three failures happen repeatedly:

1. **No policy gate** — high-risk actions execute automatically with no checkpoint
2. **No audit trail** — when something goes wrong, there's no verifiable record of what happened and why
3. **No approval workflow** — humans can't review and approve actions before they execute

MAP solves all three, for any action your AI agent takes.

---

## How it works

```
┌─────────────────────────────────────────────────────────────┐
│  AI System (ChatGPT, Claude, Copilot, your agent)           │
│  "Transfer $5,000 to vendor_abc"                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ Intent
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  MAP Policy Engine                                          │
│  Rule: payment.* + amount > 1000 → require_approval        │
│  Rule: db.write + env=production → deny                     │
└──────────┬──────────────┬──────────────────────────────────┘
           │              │
     ALLOW │        REQUIRE_APPROVAL
           │              │
           ▼              ▼
    ┌──────────┐   ┌──────────────────────────────────┐
    │ Execute  │   │ Notify approver (webhook/Slack)  │
    │ Adapter  │   │ Human reviews and approves       │
    └────┬─────┘   │ MAP re-evaluates → Execute       │
         │         └──────────────────────────────────┘
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Signed Receipt                                             │
│  { receipt_id, action, policy_checks, timestamp, sig }     │
│  Cryptographically verifiable. Tamper-evident.             │
└─────────────────────────────────────────────────────────────┘
```

---

## Policy

Policy is a JSON document. It lives outside your code. Change it at runtime without restarting.

### Simple DSL (recommended for getting started)

```typescript
const agent = map({
  policy: [
    // Payments: require approval above $1000
    { when: 'payment.*',        amount_gt: 1000,   require: 'approval' },

    // Database: block all writes to production
    { when: 'db.write',         env: 'production', require: 'deny'     },

    // Infrastructure: always require approval in production
    { when: 'aws.*',            env: 'production', require: 'approval' },
    { when: 'k8s.*',            env: 'production', require: 'approval' },

    // Critical risk: always require approval regardless of capability
    { when: '*',                risk: 'critical',  require: 'approval' },

    // Services: block non-service requesters from internal APIs
    { when: 'internal.*',       requester_type: 'user', require: 'deny' },

    // Everything else: allow
    { when: '*',                                   require: 'allow'    },
  ],
});
```

### Full policy document (for advanced use)

```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "high-value-payment",
      "capability": "payment.*",
      "condition": { "gt": ["input.amount", 1000] },
      "action": "require_approval"
    },
    {
      "id": "production-db-write",
      "capability": "db.write",
      "condition": { "eq": ["constraints.environment", "production"] },
      "action": "deny"
    }
  ]
}
```

### Load from a file

```typescript
const agent = map({ policy: './policy.json' });
```

### Hot-swap at runtime

```typescript
// No restart needed
agent.setPolicy([
  { when: '*', require: 'deny' } // lockdown
]);
```

### Check without executing

```typescript
const check = agent.check('payment.execute', { amount: 5000 });
// { action: 'require_approval', reason: 'Rule: high-value-payment' }
```

---

## Approval workflow

When policy returns `require_approval`, MAP stops execution and notifies your approver.

```typescript
const agent = map({
  policy: [
    { when: 'payment.*', amount_gt: 1000, require: 'approval' },
  ],

  onApprovalRequired: async ({ capability, input_summary, approval_reference, approve }) => {
    // Send to Slack, email, your ticketing system — whatever you use
    await slack.send(`Approve ${capability}? Amount: ${input_summary.amount}`);

    // When the human approves, call approve()
    // (or store approval_reference and call agent.approve(ref) later)
    const approved = await waitForHumanDecision();
    if (approved) await approve();
  },
});
```

Or handle it manually:

```typescript
const result = await agent.run('payment.execute', { amount: 5000 });

if (result.status === 'approval_required') {
  // Store result.approval_reference, notify approver
  // Later, when approved:
  const approved = await agent.approve(result.approval_reference);
}
```

---

## Built-in adapters

MAP ships with adapters for common capabilities:

```typescript
import { map, HttpAdapter, PaymentExecuteAdapter, DbReadAdapter } from '@sidianlabs/map-sdk';

const agent = map({ policy: [...] });

// HTTP requests (SSRF protection built in)
agent.can('http.request', new HttpAdapter());

// Stripe-compatible payments (simulation mode without API key)
agent.can('payment.execute', new PaymentExecuteAdapter());

// PostgreSQL reads (SELECT-only, output minimization)
agent.can('db.read', new DbReadAdapter());
```

Or build your own:

```typescript
agent.can('crm.update', async (input, context) => {
  await salesforce.update(input.record_id, input.fields);
  return { updated: true, record_id: input.record_id };
});
```

---

## Signed receipts

Every decision generates a cryptographically signed receipt. Tamper-evident. Independently verifiable.

```json
{
  "receipt_id": "receipt:intent_abc123:1747123456789",
  "intent_id": "intent_abc123",
  "capability": "payment.execute",
  "action": "executed",
  "timestamp": "2026-05-15T10:00:00Z",
  "status": "ok",
  "signature": "eyJhbGciOiJIUzI1NiIsImtpZCI6Im1hcC1kZXYta2V5LTEiLCJ0eXAiOiJNQVBTSUcifQ..."
}
```

---

## HTTP server

For production deployments, run MAP as an HTTP server:

```bash
MAP_POLICY_PATH=./policy.json \
MAP_APPROVAL_WEBHOOK_URL=https://your-app.com/approvals \
MAP_SIGNING_SECRET=your-secret \
npm run dev:server
```

```bash
# Dispatch an intent
curl -X POST http://localhost:8787/dispatch \
  -H "Content-Type: application/json" \
  -d '{ "capability": "payment.execute", "envelope": { ... } }'

# Get current policy
curl http://localhost:8787/policy

# Hot-swap policy
curl -X POST http://localhost:8787/policy -d @policy.json

# Query audit trail
curl http://localhost:8787/audit-events
```

---

## EU AI Act compliance

The EU AI Act requires audit trails for high-risk AI systems (August 2, 2026 deadline).

MAP provides:
- ✅ Tamper-evident audit event log (`GET /audit-events`)
- ✅ Cryptographically signed execution receipts
- ✅ Hash-chained audit checkpoints (verifiable integrity)
- ✅ Policy decision records (what rule triggered, why)
- ✅ Human oversight via approval workflow
- ✅ Export-ready audit data

---

## Performance

Policy evaluation is sub-millisecond. MAP adds essentially zero overhead.

| Scenario | Latency | Throughput |
|----------|---------|------------|
| Policy eval (5 rules) | ~1µs | 1.2M/sec |
| Policy eval (100 rules) | ~20µs | 50K/sec |
| Full execution (no I/O) | ~4µs | 256K/sec |
| Policy hot-swap | ~6µs | instant |

Compare: AI-in-loop approaches average 10,000–15,000ms. MAP is **3,000–10,000x faster**.

---

## Deployment profiles

| Profile | Use Case | Signed Requests | Tenant Required | Key Algorithm |
|---------|----------|-----------------|-----------------|---------------|
| `open` | Development | Optional | Optional | HS256 or RS256 |
| `verified` | Staging/Production | Required | Optional | RS256 only |
| `regulated` | Finance/Healthcare | Required | Required | RS256 only |

```bash
MAP_DEPLOYMENT_PROFILE=regulated
```

---

## SDKs

| Language | Package | Status |
|----------|---------|--------|
| TypeScript | `@sidianlabs/map-sdk` | ✅ Complete |
| Python | `mapprotocol` | ⚠️ Preview |
| Go | `github.com/SidianLabs/micro-agent-protocol` | ⚠️ Preview |

---

## Specification

The protocol specification is at [`spec/MAP-SPEC-v1.md`](./spec/MAP-SPEC-v1.md).

MAP is an open protocol. Anyone can implement it in any language. The TypeScript reference server is one implementation.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Server port |
| `MAP_DEPLOYMENT_PROFILE` | `open` | `open`, `verified`, or `regulated` |
| `MAP_POLICY_PATH` | — | Path to JSON policy file |
| `MAP_SIGNING_SECRET` | demo key | HMAC signing secret |
| `MAP_APPROVAL_WEBHOOK_URL` | — | Default webhook for approval notifications |
| `MAP_SERVER_BASE_URL` | — | Server base URL (used in approval payloads) |
| `MAP_ADMIN_TOKEN` | — | Token for admin endpoints |
| `MAP_REQUIRE_TENANT` | `false` | Require tenant_id on all requests |
| `MAP_PAYMENT_API_KEY` | — | Payment provider API key |
| `MAP_DB_CONNECTION_STRING` | — | PostgreSQL connection string |

---

## License

Apache 2.0 — [LICENSE](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Major changes require a MAP Enhancement Proposal (MEP) in `rfcs/`.

## Security

Report vulnerabilities via GitHub Security Advisory. See [SECURITY.md](./SECURITY.md).

---

*MAP is built by [Sidian Labs](https://sidian.dev). Maintained by [@BHAWESHBHASKAR](https://github.com/BHAWESHBHASKAR).*
