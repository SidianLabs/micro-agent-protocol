# MAP Protocol Specification v1.0

Micro Agent Protocol (MAP) is an open protocol standard for deploying policy-aware micro-agents between external AI assistants and sensitive internal systems. MAP enables organizations to maintain control over execution authority while delegating specific tasks to company-owned micro-agents.

## Overview

### What MAP Is

MAP (Micro Agent Protocol) is:

- **A protocol for assistant-to-micro-agent delegation**: External assistants (such as ChatGPT, Claude, Copilot, or enterprise orchestration layers) can delegate specific tasks to organization-owned micro-agents via MAP's well-defined interfaces.
- **A framework for companies to deploy their own micro-agents**: Organizations deploy micro-agents behind a MAP boundary that enforce local policy, use local tools, and return only minimum useful results.
- **A trust boundary**: MAP creates a clear boundary between general assistants and sensitive systems, ensuring credentials and capabilities remain under organizational control.
- **A context boundary**: MAP compresses and redacts what goes back upstream, preventing context overload.

### Core Thesis

Modern agent systems are missing a middle layer. Today, the usual choices are:

- Raw tools exposed through protocols like MCP
- Heavyweight peer-agent communication models like A2A

MAP introduces a third model: small, capability-scoped micro-agents deployed by the company that owns the system.

```
Traditional: assistant -> raw tool
With MAP:    assistant -> company MAP micro-agent -> local system
```

That shift changes who controls execution, who holds credentials, how much context is exposed, and where policy is enforced.

### Why MAP Exists

MAP exists to solve three linked problems in production agent systems:

1. **Context overload**: The assistant receives too much raw schema, trace, and system output.
2. **Over-centralized authority**: The assistant ends up with direct access to dangerous capabilities.
3. **Weak trust boundaries**: Sensitive execution is represented as simple tool calls instead of local, policy-aware decisions.

### Use Cases

#### Payments

A payment company (such as a payment processor) can deploy MAP micro-agents that handle:

- Merchant validation
- Fraud and risk checks
- Approval rules
- Payment execution
- Receipts and audit trails

The external assistant can gather user intent and seller information, but the company-owned payment micro-agent decides whether the payment can proceed.

```json
MAP/examples/payment-task-envelope.json#L1-22
{
  "task_id": "task_123",
  "parent_task_id": "task_root_001",
  "requester_identity": {
    "type": "user",
    "id": "user_42"
  },
  "target_agent": "payment-agent-v1",
  "intent": "Pay approved vendor for invoice INV-223",
  "constraints": {
    "common": {
      "resource_id": "vendor_abc",
      "max_amount": 4500,
      "currency": "INR"
    },
    "domain": {
      "invoice_id": "INV-223",
      "approved_vendor_only": true
    }
  },
  "risk_class": "high",
  "deadline": "2026-03-19T18:00:00Z",
  "delegation_token": "signed-token-ref",
  "requested_output_mode": "summary",
  "metadata": {
    "source": "demo",
    "schema_version": "1.1.0"
  }
}
```

#### Databases

A company can deploy `DBReadAgent` or `DBWriteAgent` in front of internal databases. Instead of exposing a broad database tool to the main assistant, the micro-agent:

- Runs the query locally
- Filters or aggregates results
- Applies access policy
- Returns only the answer or summary needed upstream

```json
MAP/examples/dbread-task-envelope.json#L1-23
{
  "task_id": "task_db_001",
  "requester_identity": {
    "type": "user",
    "id": "engineer_17"
  },
  "target_agent": "dbread-agent-v1",
  "intent": "Fetch active incident summary for the payments service",
  "constraints": {
    "common": {
      "environment": "staging",
      "limit": 5,
      "redaction_level": "basic"
    },
    "domain": {
      "query_type": "aggregate",
      "dataset": "incident_metrics",
      "service": "payments"
    }
  },
  "risk_class": "medium",
  "deadline": "2026-03-19T18:00:00Z",
  "delegation_token": "signed-token-ref",
  "requested_output_mode": "summary"
}
```

#### Enterprise Systems

MAP fits any system where execution should stay local to the owner of the resource:

- CRM systems
- ERP systems
- Internal APIs
- Document systems
- Local files
- Compliance workflows
- Production operations

---

## Architecture

### Five Layer Architecture

MAP has five main layers forming a reference architecture:

```
MAP/docs/protocol-spec.md#L1-50
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: External Assistant                                 │
│  (User-facing agent: ChatGPT, Claude, Copilot, Enterprise)  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: MAP Control Plane                                  │
│  ├── Registry (Agent Discovery)                              │
│  ├── Policy Engine (Authorization)                          │
│  ├── Delegation Service (Token Issuance)                     │
│  ├── Task Store (State Management)                           │
│  ├── Receipt Store (Audit Logs)                             │
│  └── Async Queue (Job Processing)                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Policy and Trust Layer                            │
│  ├── Signing Keys (HMAC/RSA)                                │
│  ├── Trust Bundles                                           │
│  ├── Audit Checkpoints                                       │
│  └── Conformance Reports                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Company Micro-Agent Runtime                        │
│  ├── PaymentAgent                                           │
│  ├── DBReadAgent                                            │
│  ├── CRMUpdateAgent                                         │
│  └── FileAgent                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: Resource Adapters                                  │
│  (Payment Rails, Databases, CRM Systems, Files, APIs)      │
└─────────────────────────────────────────────────────────────┘
```

### Control Plane Components

The MAP Control Plane manages the lifecycle of tasks and micro-agents:

| Component | Purpose |
|-----------|---------|
| **AgentRegistry** | Maintains the registry of available agents and their capabilities |
| **TaskStore** | Persists task state and results |
| **ReceiptStore** | Stores execution receipts for audit trails |
| **AsyncTaskQueue** | Manages async task processing with retry logic |
| **PolicyEngine** | Evaluates policies based on task context |
| **DelegationService** | Issues and validates delegation tokens |

### Runtime Components

The runtime hosts micro-agents that execute actual operations:

```typescript
MAP/src/src/app.ts#L14-54
export function createReferenceApp(options: ReferenceAppOptions = {}) {
  const registry = new AgentRegistry();
  const policyEngine = new DefaultPolicyEngine({ requireTenant: options.requireTenant });
  const delegationService = new DelegationService();
  const asyncQueue = new AsyncTaskQueue({ ... });
  const taskStore = new TaskStore({ ... });
  const receiptStore = new ReceiptStore({ ... });
  const agents = [
    ...(options.agents ?? []),
    ...(options.includeExampleAgents ? createExampleAgents() : [])
  ];

  for (const agent of agents) {
    registry.register(agent.descriptor);
  }

  const runtimes = new Map<string, MicroAgent>(
    agents.map((agent) => [agent.descriptor.agent_id, agent])
  );
  const orchestrator = new OrchestratorRuntime(
    registry, policyEngine, delegationService, runtimes,
    taskStore, receiptStore, asyncQueue
  );

  return { registry, policyEngine, delegationService, taskStore, receiptStore, asyncQueue, orchestrator, runtimes };
}
```

### Trust Boundaries

MAP enforces trust boundaries at multiple levels:

1. **Network boundary**: All requests must be authenticated (except in `open` profile)
2. **Policy boundary**: All tasks are evaluated against policy before execution
3. **Delegation boundary**: Tokens scope what actions can be performed
4. **Result boundary**: Output modes control what data is returned

---

## Protocol Types

### Core Type System

All protocol types are defined in `protocol/map-types.ts` and generated into SDK packages.

### Enumerations

#### RiskLevel

Defines the risk classification of a task:

```typescript
MAP/protocol/map-types.ts#L1
export type RiskLevel = "low" | "medium" | "high" | "critical";
```

| Value | Description |
|-------|-------------|
| `low` | Minimal risk, standard operations |
| `medium` | Moderate risk, may affect single records |
| `high` | Significant risk, requires approval above thresholds |
| `critical` | Maximum risk, always requires approval |

#### ExecutionMode

Defines the mode of task execution:

```typescript
MAP/protocol/map-types.ts#L3-10
export type ExecutionMode =
  | "read"
  | "analyze"
  | "propose"
  | "commit"
  | "monitor"
  | "batch";
```

| Value | Description |
|-------|-------------|
| `read` | Read-only operations, no side effects |
| `analyze` | Analysis operations, may involve computation |
| `propose` | Proposes changes without committing |
| `commit` | Commits changes to external systems |
| `monitor` | Long-running monitoring operations |
| `batch` | Batch processing operations |

#### VisibilityMode

Controls the output visibility level:

```typescript
MAP/protocol/map-types.ts#L12-14
export type VisibilityMode =
  | "full"
  | "summary"
  | "structured_only"
  | "receipt_only"
  | "redacted"
  | "debug";
```

| Value | Description |
|-------|-------------|
| `full` | Complete result output |
| `summary` | Summary only, redacted details |
| `structured_only` | Machine-readable output only |
| `receipt_only` | Receipt reference only |
| `redacted` | Redacted output with redaction markers |
| `debug` | Debug information included |

#### DeliveryMode

Defines how results are delivered:

```typescript
MAP/protocol/map-types.ts#L16-17
export type DeliveryMode = "sync" | "async";
```

| Value | Description |
|-------|-------------|
| `sync` | Synchronous result delivery |
| `async` | Asynchronous result via callback/webhook |

#### TaskStatus

Tracks task lifecycle status:

```typescript
MAP/protocol/map-types.ts#L19-27
export type TaskStatus =
  | "accepted"
  | "proposed"
  | "awaiting_approval"
  | "denied"
  | "running"
  | "completed"
  | "failed"
  | "revoked";
```

| Value | Description |
|-------|-------------|
| `accepted` | Task received and accepted |
| `proposed` | Task proposed, awaiting decision |
| `awaiting_approval` | Requires human approval |
| `denied` | Task denied by policy or approver |
| `running` | Task currently executing |
| `completed` | Task completed successfully |
| `failed` | Task failed during execution |
| `revoked` | Task was revoked by requester |

#### AuthScheme

Authentication schemes supported by agents:

```typescript
MAP/protocol/map-types.ts#L29-32
export type AuthScheme = "none" | "bearer" | "mtls" | "signed_request";
```

| Value | Description |
|-------|-------------|
| `none` | No authentication required |
| `bearer` | Bearer token authentication (JWT) |
| `mtls` | Mutual TLS authentication |
| `signed_request` | HMAC/RSA signed request authentication |

### Interfaces

#### RequesterIdentity

Identifies the entity making a request:

```typescript
MAP/protocol/map-types.ts#L34-38
export interface RequesterIdentity {
  type: "user" | "service" | "agent";
  id: string;
  tenant_id?: string;
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"user" \| "service" \| "agent"` | Yes | Type of requester |
| `id` | `string` | Yes | Unique identifier of requester |
| `tenant_id` | `string` | No | Tenant identifier for multi-tenant deployments |

#### TaskEnvelope

Encapsulates a task dispatch request:

```typescript
MAP/protocol/map-types.ts#L60-73
export interface TaskEnvelope {
  task_id: string;
  parent_task_id?: string;
  requester_identity: RequesterIdentity;
  target_agent: string;
  intent: string;
  constraints: TaskConstraints;
  risk_class: RiskLevel;
  deadline?: string;
  delegation_token: string;
  requested_output_mode: VisibilityMode;
  metadata?: Record<string, unknown>;
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | `string` | Yes | Unique task identifier |
| `parent_task_id` | `string` | No | Parent task for nested operations |
| `requester_identity` | `RequesterIdentity` | Yes | Identity of the requester |
| `target_agent` | `string` | Yes | Target agent ID |
| `intent` | `string` | Yes | Natural language intent description |
| `constraints` | `TaskConstraints` | Yes | Execution constraints |
| `risk_class` | `RiskLevel` | Yes | Risk classification |
| `deadline` | `string` | No | ISO 8601 deadline timestamp |
| `delegation_token` | `string` | Yes | Scoped authority token |
| `requested_output_mode` | `VisibilityMode` | Yes | Desired output visibility |
| `metadata` | `Record<string, unknown>` | No | Arbitrary metadata |

#### TaskConstraints

Defines constraints on task execution:

```typescript
MAP/protocol/map-types.ts#L40-58
export interface TaskConstraints {
  common?: {
    resource_id?: string;
    resource_ids?: string[];
    environment?: "development" | "staging" | "production";
    max_amount?: number;
    currency?: string;
    limit?: number;
    approval_required?: boolean;
    time_window?: {
      start: string;
      end: string;
    };
    redaction_level?: "none" | "basic" | "strict";
    [key: string]: unknown;
  };
  domain?: Record<string, unknown>;
  [key: string]: unknown;
}
```

#### DelegationToken

Represents scoped authority for agent execution:

```typescript
MAP/protocol/map-types.ts#L75-92
export interface DelegationToken {
  issuer: string;
  subject_agent: string;
  allowed_actions: string[];
  resource_scope: Record<string, unknown>;
  constraints: Record<string, unknown> & {
    common?: Record<string, unknown>;
    domain?: Record<string, unknown>;
    expires_at: string;
  };
  approval_reference?: string;
  requester_identity?: RequesterIdentity;
  signature: string;
}
```

Example delegation token:

```json
MAP/examples/payment-delegation-token.json#L1-22
{
  "issuer": "map-policy-service",
  "subject_agent": "payment-agent-v1",
  "allowed_actions": ["payment.execute"],
  "resource_scope": {
    "vendors": ["vendor_abc"],
    "currency": "INR"
  },
  "constraints": {
    "common": {
      "resource_id": "vendor_abc",
      "max_amount": 4500,
      "currency": "INR"
    },
    "domain": {
      "invoice_id": "INV-223",
      "approved_vendor_only": true
    },
    "expires_at": "2026-03-19T18:05:00Z"
  },
  "approval_reference": "approval_998",
  "requester_identity": {
    "type": "user",
    "id": "user_42"
  },
  "signature": "sig_demo_token"
}
```

#### DispatchRequest

Request to dispatch a task:

```typescript
MAP/protocol/map-types.ts#L130-136
export interface DispatchRequest {
  capability: string;
  envelope: TaskEnvelope;
  requested_schema_version?: string;
  negotiation?: InvocationNegotiationRequest;
}
```

#### ApprovalRequest

Request for task approval:

```typescript
MAP/protocol/map-types.ts#L138-144
export interface ApprovalRequest {
  task_id: string;
  approval_reference: string;
  capability: string;
  envelope: TaskEnvelope;
  requested_schema_version?: string;
  negotiation?: InvocationNegotiationRequest;
}
```

#### ResultPackage

Contains task execution results:

```typescript
MAP/protocol/map-types.ts#L94-108
export interface ResultPackage {
  task_id: string;
  status: TaskStatus;
  summary?: string;
  structured_output: Record<string, unknown>;
  receipt_ref?: string;
  negotiated_schema_version?: string;
  requested_schema_version?: string;
  executed_schema_version?: string;
  negotiation?: InvocationNegotiation;
  redactions_applied?: string[];
  followup_required: boolean;
  escalation_reason?: string;
}
```

Example result package:

```json
MAP/examples/payment-result-package.json#L1-21
{
  "task_id": "task_123",
  "status": "completed",
  "summary": "Payment executed for approved vendor against matched invoice.",
  "requested_schema_version": "1.0.0",
  "executed_schema_version": "1.1.0",
  "structured_output": {
    "transaction_id": "txn_001",
    "invoice_id": "INV-223",
    "amount": 4500,
    "currency": "INR"
  },
  "receipt_ref": "receipt_abc",
  "redactions_applied": ["credentials", "internal_policy_trace"],
  "followup_required": false
}
```

#### ExecutionReceipt

Cryptographically signed audit record:

```typescript
MAP/protocol/map-types.ts#L110-128
export interface ExecutionReceipt {
  receipt_id: string;
  task_id: string;
  tenant_id?: string;
  request_id?: string;
  agent_id: string;
  action_taken: string;
  resource_touched: string;
  policy_checks: string[];
  approval_used?: string;
  timestamp: string;
  result_hash: string;
  requested_schema_version?: string;
  executed_schema_version?: string;
  negotiation?: InvocationNegotiation;
  signature: string;
}
```

Example execution receipt:

```json
MAP/examples/payment-execution-receipt.json#L1-20
{
  "receipt_id": "receipt_abc",
  "task_id": "task_123",
  "agent_id": "payment-agent-v1",
  "action_taken": "payment.execute",
  "resource_touched": "vendor_abc",
  "policy_checks": ["vendor_approved", "invoice_matched", "amount_within_threshold"],
  "approval_used": "approval_998",
  "timestamp": "2026-03-19T17:55:10Z",
  "result_hash": "sha256:payment-result-demo",
  "requested_schema_version": "1.0.0",
  "executed_schema_version": "1.1.0",
  "signature": "sig_demo_receipt"
}
```

#### PolicyDecision

Result of policy evaluation:

```typescript
MAP/protocol/map-types.ts#L149-157
export interface PolicyDecision {
  allowed: boolean;
  action: "allow" | "deny" | "require_approval";
  policy_checks: string[];
  reason?: string;
  approval_reference?: string;
  scoped_constraints?: Record<string, unknown>;
}
```

#### AgentDescriptor

Describes an agent's capabilities:

```typescript
MAP/protocol/map-types.ts#L46-58
export interface AgentDescriptor {
  agent_id: string;
  organization: string;
  version: string;
  domain: string;
  capabilities: string[];
  risk_level: RiskLevel;
  input_schema_ref: string;
  output_schema_ref: string;
  supported_execution_modes: ExecutionMode[];
  approval_requirements?: string[];
  visibility_modes: VisibilityMode[];
  // ... additional fields
}
```

#### MapErrorResponse

Error response structure:

```typescript
MAP/protocol/map-types.ts#L34-48
export interface MapErrorResponse {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  status: number;
  details?: {
    category: "validation" | "authentication" | "authorization" | "not_found" | "conflict" | "rate_limit" | "server" | "client";
    field?: string;
    value?: unknown;
    context?: Record<string, unknown>;
  };
  request_id?: string;
}
```

---

## Task Lifecycle

### Task State Diagram

```
                    ┌──────────────┐
                    │   accepted   │◄──────── Initial dispatch
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
              ┌─────│   proposed   │
              │     └──────────────┘
              │
              ▼
    ┌─────────────────┐     ┌──────────────────┐
    │awaiting_approval│────►│      denied      │
    └─────────────────┘     └──────────────────┘
              │
              │ (approved)
              ▼
    ┌─────────────────┐     ┌──────────────────┐
    │     running     │────►│      failed      │
    └─────────────────┘     └──────────────────┘
              │
              │ (complete)
              ▼
    ┌─────────────────┐
    │   completed     │
    └─────────────────┘
```

### Task Creation

1. **Requester** sends a `DispatchRequest` with a `TaskEnvelope`
2. **Control Plane** validates the request schema
3. **Delegation Token** is validated
4. **Policy Engine** evaluates the request

### Policy Evaluation

The default policy engine evaluates tasks based on multiple factors:

```typescript
MAP/src/src/control-plane/policy.ts#L22-72
evaluate({ descriptor, envelope }: PolicyContext): PolicyDecision {
  const common = (envelope.constraints.common ?? {}) as Record<string, unknown>;
  const domain = (envelope.constraints.domain ?? {}) as Record<string, unknown>;
  const maxAmount = Number(common.max_amount ?? 0);
  const approvedVendorOnly = domain.approved_vendor_only === true;
  const environment = String(common.environment ?? "");

  // Critical capabilities always require approval
  if (descriptor.risk_level === "critical") {
    return { allowed: false, action: "require_approval", ... };
  }

  // Payments must target approved vendors
  if (descriptor.domain === "payments" && !approvedVendorOnly) {
    return { allowed: false, action: "deny", ... };
  }

  // Payment amount threshold check
  if (descriptor.domain === "payments" && maxAmount > 1000) {
    return { allowed: false, action: "require_approval", ... };
  }

  // Production database reads require approval
  if (descriptor.domain === "database" && environment === "production") {
    return { allowed: false, action: "require_approval", ... };
  }

  return { allowed: true, action: "allow", ... };
}
```

### Execution Modes

Tasks can be executed in different modes:

| Mode | Description | Idempotent |
|------|-------------|------------|
| `read` | Read-only operation | Yes |
| `analyze` | Analysis without side effects | Yes |
| `propose` | Proposes changes | Yes |
| `commit` | Commits actual changes | No |
| `monitor` | Long-running observation | Yes |
| `batch` | Processes multiple items | Depends |

### Approval Workflows

1. **Automatic Deny**: Policy explicitly denies the request
2. **Require Approval**: Policy requires human approval before execution
3. **Allow**: Policy allows execution to proceed

When approval is required:
- Task status changes to `awaiting_approval`
- `approval_reference` is returned
- Approver can approve via `/approve` endpoint
- Approved tasks proceed to `running` status

### Result Delivery

1. **Agent** executes the task
2. **ResultPackage** is constructed with results
3. **ExecutionReceipt** is generated and signed
4. **Receipt** is stored for audit
5. **Result** is returned to requester based on `requested_output_mode`

---

## Security Model

### Authentication Schemes

MAP supports multiple authentication schemes:

| Scheme | Description | Use Case |
|--------|-------------|----------|
| `none` | No authentication | Local development only |
| `bearer` | JWT Bearer tokens | Standard API access |
| `mtls` | Mutual TLS | High-security deployments |
| `signed_request` | HMAC/RSA signed requests | Webhook integrations |

### Request Signing (HMAC/RSA)

MAP supports two signing algorithms for signed requests:

#### HMAC Signing (HS256)

```typescript
MAP/src/src/security/signing.ts#L226-266
function createCompactSignature(signingKey: SigningKey, payload: string): string {
  const header = { alg: signingKey.alg, kid: signingKey.kid, typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signer(signingInput, signingKey.material.secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
```

#### RSA Signing (RS256)

```typescript
MAP/src/src/security/signing.ts#L253-264
const signature = sign(Buffer.from(signingInput), signingKey.material.private_key_pem, "RSA-SHA256");
```

### Signed Request Headers

```typescript
MAP/src/src/security/signing.ts#L485-493
function signHttpRequest(request: SignedRequestPayload): Record<string, string> {
  const signature = createCompactSignature(signingKey, signedRequestPayload(request));
  return {
    "x-map-auth-scheme": "signed_request",
    "x-map-key-id": request.key_id,
    "x-map-timestamp": request.timestamp,
    "x-map-request-signature": signature
  };
}
```

Required headers for signed requests:

| Header | Description |
|--------|-------------|
| `x-map-auth-scheme` | Must be `"signed_request"` |
| `x-map-key-id` | Key identifier |
| `x-map-timestamp` | ISO 8601 timestamp |
| `x-map-request-signature` | Base64URL signature |

### Delegation Tokens

Delegation tokens are JWT-like structures that grant scoped authority:

```typescript
MAP/src/src/security/signing.ts#L373-383
function tokenSigningPayload(token: DelegationToken): string {
  return stableStringify({
    iss: token.issuer,
    sub: token.subject_agent,
    actions: token.allowed_actions,
    scope: token.resource_scope,
    constraints: token.constraints,
    approval_ref: token.approval_reference,
    requester: token.requester_identity
  });
}
```

### Receipt Signatures

Execution receipts are cryptographically signed for auditability:

```typescript
MAP/src/src/security/signing.ts#L396-415
function receiptSigningPayload(receipt: ExecutionReceipt): string {
  return stableStringify({
    receipt_id: receipt.receipt_id,
    task_id: receipt.task_id,
    tenant_id: receipt.tenant_id,
    request_id: receipt.request_id,
    agent_id: receipt.agent_id,
    action_taken: receipt.action_taken,
    resource_touched: receipt.resource_touched,
    policy_checks: receipt.policy_checks,
    approval_used: receipt.approval_used,
    timestamp: receipt.timestamp,
    result_hash: receipt.result_hash,
    requested_schema_version: receipt.requested_schema_version,
    executed_schema_version: receipt.executed_schema_version,
    negotiation: receipt.negotiation
  });
}
```

### Key Rotation

Keys are stored in environment variables and can be rotated by updating configuration:

```typescript
MAP/src/src/security/signing.ts#L108-178
function getSigningKeys(): SigningKey[] {
  const revokedKids = getRevokedKidsFromEnv();
  const providerKeys = JSON.parse(process.env.MAP_SIGNING_KEYS ?? "[]");
  
  const keys = providerKeys.map((key: Record<string, unknown>) => {
    const alg = key.alg as string;
    const status = revokedKids.has(key.kid as string) ? "revoked" : (key.status as string);
    // ... material handling for RSA/HMAC
  });
  
  return keys.filter(k => k.status !== "revoked");
}
```

---

## Error Handling

### Error Codes

MAP defines 24+ error codes for precise error classification:

```typescript
MAP/packages/typescript/src/errors.ts#L3-28
export type ErrorCode =
  | "agent_not_found"
  | "agent_disabled"
  | "capability_not_found"
  | "capability_disabled"
  | "policy_denied"
  | "approval_required"
  | "approval_denied"
  | "approval_expired"
  | "invalid_delegation_token"
  | "token_expired"
  | "token_invalid_signature"
  | "token_missing_scope"
  | "schema_validation_failed"
  | "schema_version_unsupported"
  | "schema_negotiation_failed"
  | "tenant_mismatch"
  | "rate_limit_exceeded"
  | "request_timeout"
  | "internal_error"
  | "invalid_request"
  | "idempotency_conflict"
  | "resource_not_found"
  | "unauthorized"
  | "forbidden";
```

### Error Code to HTTP Status Mapping

```typescript
MAP/packages/typescript/src/errors.ts#L30-53
export const ERROR_CODE_STATUS_MAP: Record<ErrorCode, number> = {
  agent_not_found: 404,
  agent_disabled: 403,
  capability_not_found: 404,
  capability_disabled: 403,
  policy_denied: 403,
  approval_required: 202,
  approval_denied: 403,
  approval_expired: 410,
  invalid_delegation_token: 401,
  token_expired: 401,
  token_invalid_signature: 401,
  token_missing_scope: 403,
  schema_validation_failed: 400,
  schema_version_unsupported: 400,
  schema_negotiation_failed: 400,
  tenant_mismatch: 400,
  rate_limit_exceeded: 429,
  request_timeout: 408,
  internal_error: 500,
  invalid_request: 400,
  idempotency_conflict: 409,
  resource_not_found: 404,
  unauthorized: 401,
  forbidden: 403,
};
```

### Retryable Errors

```typescript
MAP/packages/typescript/src/errors.ts#L55-78
export const ERROR_CODE_RETRYABLE_MAP: Record<ErrorCode, boolean> = {
  agent_not_found: false,
  agent_disabled: false,
  capability_not_found: false,
  capability_disabled: false,
  policy_denied: false,
  approval_required: false,
  approval_denied: false,
  approval_expired: false,
  invalid_delegation_token: false,
  token_expired: false,
  token_invalid_signature: false,
  token_missing_scope: false,
  schema_validation_failed: false,
  schema_version_unsupported: false,
  schema_negotiation_failed: false,
  tenant_mismatch: false,
  rate_limit_exceeded: true,       // Retry after backoff
  request_timeout: true,           // Retry after backoff
  internal_error: true,            // Retry after backoff
  invalid_request: false,
  idempotency_conflict: false,
  resource_not_found: false,
  unauthorized: true,              // Retry after re-auth
  forbidden: false,
};
```

### Error Response Format

```typescript
MAP/protocol/map-types.ts#L34-48
export interface MapErrorResponse {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  status: number;
  details?: {
    category: "validation" | "authentication" | "authorization" | "not_found" | "conflict" | "rate_limit" | "server" | "client";
    field?: string;
    value?: unknown;
    context?: Record<string, unknown>;
  };
  request_id?: string;
}
```

### Error Examples

#### Agent Not Found

```json
MAP/examples/error-handling-examples.json#L14-30
{
  "code": "agent_not_found",
  "message": "Target agent 'nonexistent-agent' not found in registry",
  "retryable": false,
  "status": 404,
  "details": {
    "category": "not_found",
    "field": "target_agent",
    "value": "nonexistent-agent",
    "context": {
      "available_agents": ["agent-payment", "agent-dbread", "agent-crm"]
    }
  }
}
```

#### Rate Limit Exceeded

```json
MAP/examples/error-handling-examples.json#L44-55
{
  "code": "rate_limit_exceeded",
  "message": "Rate limit exceeded for MAP mutating requests",
  "retryable": true,
  "status": 429,
  "details": {
    "category": "rate_limit",
    "scope": "tenant",
    "retry_after_ms": 1000,
    "limit": 100,
    "window": "60s"
  }
}
```

#### Schema Validation Failed

```json
MAP/examples/error-handling-examples.json#L77-100
{
  "code": "schema_validation_failed",
  "message": "Validation failed: risk_class must be one of [low, medium, high, critical]",
  "retryable": false,
  "status": 400,
  "details": {
    "category": "validation",
    "validation_errors": [
      {
        "field": "risk_class",
        "message": "must be one of [low, medium, high, critical]",
        "code": "schema_validation_failed",
        "context": {
          "field_path": "envelope.risk_class",
          "value": "invalid_risk"
        }
      }
    ],
    "schema_ref": "https://map-spec.dev/schemas/task-envelope.schema.json"
  }
}
```

---

## API Reference

### Base URL

| Environment | URL |
|------------|-----|
| Production | `https://api.map-protocol.dev/v1` |
| Staging | `https://staging.map-protocol.dev/v1` |
| Local | `http://localhost:8787` |

### Endpoints Overview

| Tag | Description |
|-----|-------------|
| **Dispatch** | Task dispatch operations |
| **Approvals** | Approval workflow operations |
| **Tasks** | Task state and retrieval |
| **Receipts** | Execution receipt operations |
| **Agents** | Agent registry and discovery |
| **Health** | Health and readiness checks |
| **Admin** | Administrative operations |

### POST /dispatch

Dispatch a task to a micro-agent for execution.

**Request:**

```json
MAP/schemas/openapi.yaml#L68-73
{
  "capability": "payment.execute",
  "envelope": { /* TaskEnvelope */ },
  "requested_schema_version": "1.0.0",
  "negotiation": {
    "delivery_mode": "sync"
  }
}
```

**Response (200 OK):**

```json
MAP/schemas/openapi.yaml#L82-85
{
  "ok": true,
  "request_id": "req_abc123",
  "data": {
    "result": { /* ResultPackage */ },
    "receipt": { /* ExecutionReceipt */ }
  }
}
```

### POST /approve

Approve a pending task.

**Request:**

```json
MAP/schemas/openapi.yaml#L113-118
{
  "task_id": "task_123",
  "approval_reference": "apr_abc123",
  "capability": "payment.execute",
  "envelope": { /* TaskEnvelope */ }
}
```

### GET /tasks

List tasks with optional filtering.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tenant_id` | `string` | Filter by tenant |
| `status` | `TaskStatus` | Filter by status |
| `capability` | `string` | Filter by capability |
| `agent_id` | `string` | Filter by target agent |
| `limit` | `integer` | Max items to return |
| `cursor` | `string` | Pagination cursor |

### GET /tasks/{task_id}

Get a specific task by ID.

### GET /tasks/{task_id}/stream

Stream task status via Server-Sent Events (SSE).

### GET /receipts

List execution receipts.

### GET /receipts/{receipt_id}

Get a specific receipt by ID.

### GET /agents

List registered agents.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `domain` | `string` | Filter by domain |
| `capability` | `string` | Filter by capability |
| `status` | `string` | Filter by registry status |

### GET /agents/{agent_id}

Get an agent descriptor.

### GET /.well-known/map-keys

Get public keys for signature verification.

### GET /health

Basic liveness probe.

**Response:**

```json
MAP/schemas/openapi.yaml#L491-499
{
  "status": "ok"
}
```

### GET /ready

Readiness probe indicating server is ready to accept traffic.

### GET /status

Detailed operational status including store states and metrics.

### GET /metrics

Prometheus-compatible operational metrics.

### GET /audit-events

List audit events for compliance and monitoring.

### GET /audit-events/export

Export audit log with cryptographic verification.

### GET /audit-events/verify

Verify cryptographic integrity of audit event chain.

### GET /conformance/export

Export conformance test results.

### GET /trust-bundle/export

Export trust bundle with verification keys.

### GET /admin/keys

List signing key information.

### GET /alerts

List active operational alerts.

### POST /alerts/{alert_id}/ack

Acknowledge an alert.

### POST /alerts/{alert_id}/suppress

Temporarily suppress an alert.

### GET /dead-letters

List dead letter records for failed async jobs.

---

## Deployment Profiles

MAP supports three deployment profiles with different security requirements:

### Open Profile

Designed for development and testing.

| Setting | Value |
|---------|-------|
| `enforceSignedRequests` | `false` |
| `requireTenant` | `false` |
| Auth schemes | `none`, `bearer`, `signed_request` |

**Conformance Check:**

```typescript
MAP/src/src/conformance-profiles.ts#L55-62
const openDispatch = createDispatcher({
  deploymentProfile: "open",
  enforceSignedRequests: false,
  requireTenant: false
});
const openResponse = await openDispatch("POST", "/dispatch", makeDispatchBody({ taskId: `task_open_${randomUUID()}` }));
checks.push({
  name: "open_profile_allows_unsigned_dispatch",
  ok: openResponse.statusCode === 200 || openResponse.statusCode === 202
});
```

### Verified Profile

Designed for internal enterprise use.

| Setting | Value |
|---------|-------|
| `enforceSignedRequests` | `true` |
| `requireTenant` | `true` |
| Auth schemes | `bearer`, `signed_request` (RSA required) |

**Conformance Check:**

```typescript
MAP/src/src/conformance-profiles.ts#L72-80
const verifiedDispatch = createDispatcher({
  deploymentProfile: "verified",
  enforceSignedRequests: true,
  requireTenant: true
});
// Signed request required
const signedHeaders = signHttpRequest({ method: "POST", path: "/dispatch", ... });
const response = await verifiedDispatch("POST", "/dispatch", body, { ...signedHeaders });
checks.push({
  name: "verified_profile_allows_signed_dispatch",
  ok: response.statusCode === 200 || response.statusCode === 202
});
```

### Regulated Profile

Designed for regulated industries (finance, healthcare, government).

| Setting | Value |
|---------|-------|
| `enforceSignedRequests` | `true` |
| `requireTenant` | `true` |
| Auth schemes | `signed_request` (RSA only) |
| Additional requirements | Full audit trail, key rotation |

**Conformance Check:**

```typescript
MAP/src/src/conformance-profiles.ts#L104-117
const regulatedDispatch = createDispatcher({
  deploymentProfile: "regulated",
  enforceSignedRequests: true,
  requireTenant: true
});
// Must use RSA for regulated profile
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
// ... signed request validation
```

---

## Conformance Requirements

### Protocol Conformance

All implementations must pass the conformance test suite:

```bash
# Run all conformance suites
npm run conformance:all

# Individual suites
npm run conformance:reference    # Core protocol
npm run conformance:profiles     # Deployment profiles
npm run conformance:trust      # Trust chain
npm run conformance:fixtures     # Signature fixtures
npm run conformance:errors      # Error taxonomy
npm run conformance:contract    # API contract
npm run conformance:api-surface # Pagination + ETag
```

### Testing Requirements

| SDK | Test Command | Coverage Target |
|-----|-------------|----------------|
| TypeScript | `npm test` | >80% |
| Python | `pytest` | >80% |
| Go | `go test ./...` | >80% |

### Required vs Optional Features

| Feature | Requirement | Notes |
|---------|-------------|-------|
| HTTP Transport | Required | All implementations |
| Signed Requests (HMAC) | Required | All implementations |
| Signed Requests (RSA) | Required | Verified/Regulated profiles |
| Bearer Tokens | Optional | For simpler integrations |
| mTLS | Optional | For high-security deployments |
| Async Execution | Required | Must support async queue |
| SSE Streaming | Optional | For real-time updates |
| Audit Events | Required | Must record all operations |
| Receipt Signatures | Required | Cryptographic audit trail |

---

## Appendix: OpenAPI Specification

The complete OpenAPI 3.1 specification is available in `schemas/openapi.yaml`.

---

## Appendix: JSON Schemas

Core protocol schemas are available in `schemas/` directory:

- `task-envelope.schema.json`
- `result-package.schema.json`
- `execution-receipt.schema.json`
- `delegation-token.schema.json`
- `agent-descriptor.schema.json`
