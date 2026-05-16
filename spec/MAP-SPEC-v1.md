# MAP — Micro Agent Protocol
## Specification v1.0

**Status:** Draft  
**Authors:** Bhawesh Bhaskar (Sidian Labs)  
**License:** Apache 2.0  
**Repository:** https://github.com/SidianLabs/micro-agent-protocol

---

## Abstract

MAP (Micro Agent Protocol) defines how AI systems propose actions and how those actions are evaluated, controlled, and audited. The core principle: **AI proposes. Policy decides. Every decision is receipted.**

MAP is a protocol, not a framework. Any language, any runtime, any AI system can implement it.

---

## 1. The Problem

When an AI agent calls a tool — a payment API, a database, an email service — there is typically no control layer between the AI's decision and the action. The AI becomes the effective superuser. If it's wrong, manipulated, or confused, the action executes anyway.

Three failures happen repeatedly:

1. **No policy gate** — high-risk actions execute automatically with no checkpoint
2. **No audit trail** — when something goes wrong, there's no verifiable record of what happened and why
3. **No approval workflow** — humans can't review and approve actions before they execute

MAP solves all three.

---

## 2. Core Concepts

### 2.1 Intent

An Intent is a structured request from an AI system to perform an action. It is the only input MAP accepts from the AI.

```json
{
  "capability": "payment.execute",
  "input": {
    "amount": 5000,
    "currency": "USD",
    "vendor_id": "vendor_abc"
  },
  "requester": {
    "type": "user",
    "id": "user_123"
  },
  "risk_class": "high"
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `capability` | string | Yes | What to do. Format: `domain.action` (e.g., `payment.execute`) |
| `input` | object | Yes | Parameters for the capability |
| `requester` | object | Yes | Who is requesting |
| `requester.type` | string | Yes | `"user"` or `"service"` |
| `requester.id` | string | Yes | Unique identifier |
| `requester.tenant_id` | string | No | Tenant for multi-tenant systems |
| `constraints` | object | No | Execution constraints |
| `constraints.environment` | string | No | `"development"`, `"staging"`, or `"production"` |
| `constraints.max_amount` | number | No | Maximum allowed amount |
| `risk_class` | string | No | `"low"`, `"medium"`, `"high"`, or `"critical"` |
| `metadata.intent_id` | string | No | Unique ID for this intent |

### 2.2 Capability

Capabilities identify what an intent wants to do.

**Format:** `domain.action` or `domain.action:version`

**Examples:**
- `payment.execute`
- `db.read`
- `http.request`
- `email.send:v2`

**Wildcard matching in policy:** `payment.*` matches `payment.execute`, `payment.refund`, etc.

### 2.3 Policy

A Policy is a declarative document that governs whether intents are allowed to execute. Policy is data, not code. It can be changed at runtime without restarting the system.

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

**Rule fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique rule identifier |
| `capability` | string | Yes | Capability glob to match |
| `condition` | object | Yes | When this rule applies |
| `action` | string | Yes | `"allow"`, `"deny"`, or `"require_approval"` |

**Condition operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal | `{ "eq": ["input.currency", "USD"] }` |
| `neq` | Not equal | `{ "neq": ["requester.type", "service"] }` |
| `gt` | Greater than | `{ "gt": ["input.amount", 1000] }` |
| `gte` | Greater or equal | `{ "gte": ["input.amount", 100] }` |
| `lt` | Less than | `{ "lt": ["input.amount", 100] }` |
| `lte` | Less or equal | `{ "lte": ["input.amount", 1000] }` |
| `in` | In array | `{ "in": ["input.method", ["GET", "HEAD"]] }` |
| `and` | All conditions true | `{ "and": [...] }` |
| `or` | Any condition true | `{ "or": [...] }` |
| `not` | Negate condition | `{ "not": { "eq": [...] } }` |

**Field paths in conditions:**

| Path | Description |
|------|-------------|
| `capability` | The capability string |
| `input.<field>` | Any field in the input object |
| `constraints.environment` | The environment constraint |
| `constraints.max_amount` | The max_amount constraint |
| `risk_class` | The risk classification |
| `requester.type` | `"user"` or `"service"` |
| `requester.id` | The requester ID |
| `requester.tenant_id` | The tenant ID |

**Rule evaluation:** Rules are evaluated in document order. The first matching rule wins. If no rule matches, the default action is `allow`.

### 2.4 Policy Decision

When MAP evaluates an intent against a policy, it returns a decision:

```json
{
  "action": "require_approval",
  "reason": "Rule matched: high-value-payment",
  "matched_rule": "high-value-payment"
}
```

| Action | Meaning |
|--------|---------|
| `allow` | Execution proceeds |
| `deny` | Execution is blocked |
| `require_approval` | Execution pauses, awaiting human approval |

### 2.5 Adapter

An Adapter is the execution handler for a capability. Adapters are implementation-defined — MAP does not specify what they do, only the interface they must implement.

**Interface:**

```typescript
interface ExecutionAdapter {
  readonly capability: string;
  validate(input: unknown): ValidationResult;
  execute(input: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult>;
}

interface ExecutionContext {
  intent_id: string;
  requester: { type: string; id: string; tenant_id?: string };
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

interface ExecutionResult {
  intent_id: string;
  capability: string;
  status: "ok" | "error";
  output: Record<string, unknown>;
  summary: string;
}
```

### 2.6 Receipt

A Receipt is a cryptographically signed record of every MAP decision. Receipts are generated for every intent — whether allowed, denied, or pending approval.

```json
{
  "receipt_id": "receipt:intent_abc123:1747123456789",
  "intent_id": "intent_abc123",
  "capability": "payment.execute",
  "action": "executed",
  "timestamp": "2026-05-15T10:00:00Z",
  "status": "ok",
  "signature": "eyJhbGciOiJIUzI1NiIsImtpZCI6..."
}
```

| Field | Description |
|-------|-------------|
| `receipt_id` | Unique receipt identifier |
| `intent_id` | The intent this receipt is for |
| `capability` | The capability that was evaluated |
| `action` | `"executed"`, `"denied"`, or `"approval_required"` |
| `timestamp` | ISO 8601 timestamp |
| `status` | `"ok"` or `"error"` |
| `signature` | HMAC or RSA signature (optional but recommended) |

---

## 3. Protocol Flow

### 3.1 Normal execution (allow)

```
AI → Intent → MAP validates → Policy evaluates → allow → Adapter executes → Receipt
```

### 3.2 Blocked execution (deny)

```
AI → Intent → MAP validates → Policy evaluates → deny → Receipt (action: denied)
```

### 3.3 Approval flow (require_approval)

```
AI → Intent → MAP validates → Policy evaluates → require_approval
                                                        ↓
                                              Receipt (action: approval_required)
                                                        ↓
                                              Notification sent to approver
                                                        ↓
                                              Human reviews and approves
                                                        ↓
                                              MAP re-executes → Receipt (action: executed)
```

---

## 4. HTTP API

MAP implementations SHOULD expose an HTTP API. The following endpoints are defined:

### POST /dispatch

Submit an intent for evaluation and execution.

**Request:**
```json
{
  "capability": "payment.execute",
  "envelope": {
    "task_id": "task_001",
    "requester_identity": { "type": "user", "id": "user_123" },
    "target_agent": "payment-agent-v1",
    "intent": "{\"amount\": 5000, \"currency\": \"USD\"}",
    "constraints": { "common": { "environment": "production" } },
    "risk_class": "high",
    "delegation_token": "...",
    "requested_output_mode": "summary"
  }
}
```

**Response (executed):**
```json
{
  "result": {
    "task_id": "task_001",
    "status": "completed",
    "summary": "Payment executed",
    "structured_output": { "charge_id": "ch_123" }
  },
  "receipt": {
    "receipt_id": "receipt:task_001:...",
    "signature": "..."
  }
}
```

**Response (approval required):**
```json
{
  "result": {
    "task_id": "task_001",
    "status": "awaiting_approval",
    "structured_output": {
      "approval_reference": "approval:task_001"
    }
  },
  "receipt": { "receipt_id": "...", "signature": "..." }
}
```

### POST /approve

Submit approval for a pending task.

**Request:**
```json
{
  "task_id": "task_001",
  "approval_reference": "approval:task_001",
  "capability": "payment.execute",
  "envelope": { ... }
}
```

### GET /policy

Returns the current active policy document.

### POST /policy

Hot-swaps the active policy document at runtime.

**Request:** A valid `PolicyDocument` JSON object.

### GET /tasks

List tasks with optional filtering.

### GET /tasks/:id

Get a specific task by ID.

### GET /receipts

List execution receipts.

### GET /audit-events

Query the audit trail.

### GET /health

Health check. Returns `200` when healthy.

### GET /ready

Readiness check. Returns `503` when deployment profile constraints are violated.

---

## 5. Signing

MAP uses a compact signature format (`MAPSIG`) for receipts, delegation tokens, and HTTP requests:

```
base64url(header).base64url(payload).base64url(signature)
```

**Header:**
```json
{ "alg": "HS256" | "RS256", "kid": "<key-id>", "typ": "MAPSIG" }
```

**Supported algorithms:**
- `HS256` — HMAC-SHA256 (symmetric, for development)
- `RS256` — RSA-SHA256 (asymmetric, for production)

**HTTP request signing headers:**

| Header | Description |
|--------|-------------|
| `x-map-auth-scheme` | Must be `signed_request` |
| `x-map-key-id` | The signing key ID |
| `x-map-timestamp` | ISO 8601 timestamp (must be within ±5 minutes) |
| `x-map-request-signature` | The MAPSIG signature |
| `x-map-nonce` | Unique nonce (prevents replay) |

---

## 6. Deployment Profiles

MAP defines three deployment profiles:

| Profile | Use Case | Signed Requests | Tenant Required | Key Algorithm |
|---------|----------|-----------------|-----------------|---------------|
| `open` | Development | Optional | Optional | HS256 or RS256 |
| `verified` | Staging/Production | Required | Optional | RS256 only |
| `regulated` | Finance/Healthcare | Required | Required | RS256 only |

---

## 7. Conformance

A MAP implementation MUST:

1. Accept intents in the format defined in §2.1
2. Evaluate policy rules in document order (first match wins)
3. Return a receipt for every intent evaluation
4. Support all condition operators defined in §2.3
5. Return `allow`, `deny`, or `require_approval` decisions

A MAP implementation SHOULD:

1. Sign receipts cryptographically
2. Persist receipts in an append-only store
3. Expose the HTTP API defined in §4
4. Support hot-swapping policy via `POST /policy`
5. Deliver approval notifications via webhook

---

## 8. Relation to Other Protocols

MAP is designed to compose with, not replace, other AI protocols:

| Protocol | Role | Relationship to MAP |
|----------|------|---------------------|
| MCP | Tool connectivity | MAP wraps MCP tools with policy enforcement |
| A2A | Agent-to-agent tasks | MAP governs execution within A2A task flows |
| ACP | Commerce/payments | MAP provides the policy layer for ACP payment flows |

---

## 9. Versioning

This document describes MAP v1.0. Breaking changes will increment the major version. The `version` field in PolicyDocument MUST be `"1.0"` for this version of the spec.

---

## 10. Reference Implementation

The reference implementation is available at:
https://github.com/SidianLabs/micro-agent-protocol

It includes:
- TypeScript reference server
- Policy engine
- Built-in adapters (HTTP, Payment, Database)
- Conformance test suite
- TypeScript, Python, and Go SDKs

---

*MAP Specification v1.0 — Apache 2.0 License*
