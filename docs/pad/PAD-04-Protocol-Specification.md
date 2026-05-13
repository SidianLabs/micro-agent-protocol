# PAD-04: Protocol Specification

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Overview

MAP (Micro Agent Protocol) is an open standard for AI assistant-to-micro-agent delegation with policy enforcement. This document provides the complete protocol specification.

## 2. Core Concepts

### 2.1 Agents

**Assistant Agent**: The primary agent that initiates delegation requests (e.g., an AI assistant).

**Micro Agent**: The specialized agent that receives and executes delegated tasks (e.g., a payment processing agent).

### 2.2 Task Lifecycle

```
[DRAFT] → [PROPOSED] → [ACCEPTED/RUNNING] → [COMPLETED/FAILED]
                ↓
           [AWAITING_APPROVAL] → [DENIED]
```

### 2.3 Risk Classification

| Level | Description | Example Use Cases |
|-------|-------------|-------------------|
| low | Read-only, no cost impact | Search, query |
| medium | Limited write operations | Update profile |
| high | Significant cost/data impact | Payment, delete |
| critical | Major financial/legal impact | Wire transfer, legal |

## 3. Task Envelope

The Task Envelope is the core data structure for delegation requests.

```typescript
interface TaskEnvelope {
  task_id: string;                    // Unique task identifier
  parent_task_id?: string;             // For nested delegation
  requester_identity: RequesterIdentity;
  target_agent: string;               // Agent ID to delegate to
  intent: string;                      // Natural language intent
  constraints: TaskConstraints;         // Operational constraints
  risk_class: RiskLevel;              // low | medium | high | critical
  deadline?: string;                   // ISO 8601 timestamp
  delegation_token: string;            // Authorization token
  requested_output_mode: VisibilityMode;
  metadata?: Record<string, unknown>;
}

interface RequesterIdentity {
  type: 'user' | 'service' | 'agent';
  id: string;
  tenant_id?: string;
}

enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

enum VisibilityMode {
  FULL = 'full',
  SUMMARY = 'summary',
  STRUCTURED_ONLY = 'structured_only',
  RECEIPT_ONLY = 'receipt_only',
  REDACTED = 'redacted',
  DEBUG = 'debug',
}
```

## 4. HTTP Transport Binding

### 4.1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /dispatch | Dispatch a new task |
| POST | /approve | Approve a proposed task |
| GET | /tasks/{task_id} | Get task by ID |
| GET | /tasks | List tasks |
| GET | /agents | List available agents |
| GET | /agents/{agent_id} | Get agent by ID |
| GET | /health | Health check |

### 4.2 Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | Must be `application/json` |
| X-MAP-Auth-Scheme | No | `signed_request` for signed requests |
| X-MAP-Key-Id | Conditional | Key identifier for signed requests |
| X-MAP-Timestamp | Conditional | ISO 8601 timestamp |
| X-MAP-Request-Signature | Conditional | HMAC-SHA256 signature |
| X-MAP-Idempotency-Key | No | Idempotency key for POST requests |

### 4.3 Response Format

All responses follow a consistent envelope:

```json
{
  "ok": true,
  "request_id": "req_abc123",
  "data": { ... }
}
```

Error responses:

```json
{
  "ok": false,
  "request_id": "req_abc123",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "retryable": false,
    "details": { ... }
  }
}
```

## 5. Authentication & Signing

### 5.1 Signed Request Format

Requests can be signed using HMAC-SHA256:

```
StringToSign = HTTP_METHOD + "\n" +
               PATH + "\n" +
               TIMESTAMP + "\n" +
               BODY_HASH

Signature = Base64URL(HMAC-SHA256(Secret, StringToSign))
```

### 5.2 Headers

```
X-MAP-Auth-Scheme: signed_request
X-MAP-Key-Id: key_id
X-MAP-Timestamp: 2024-01-15T10:30:00Z
X-MAP-Request-Signature: <signature>
```

## 6. Result Package

The Result Package contains the execution result from a micro-agent.

```typescript
interface ResultPackage {
  task_id: string;
  status: TaskStatus;
  summary?: string;
  structured_output: Record<string, unknown>;
  receipt_ref?: string;
  negotiated_schema_version?: string;
  requested_schema_version?: string;
  executed_schema_version?: string;
  redactions_applied?: string[];
  followup_required: boolean;
  escalation_reason?: string;
}

enum TaskStatus {
  ACCEPTED = 'accepted',
  PROPOSED = 'proposed',
  AWAITING_APPROVAL = 'awaiting_approval',
  DENIED = 'denied',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVOKED = 'revoked',
}
```

## 7. Execution Receipt

The Execution Receipt provides an audit trail for task execution.

```typescript
interface ExecutionReceipt {
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
  signature: string;
}
```

## 8. Delegation Token

The Delegation Token scopes authority for delegation.

```typescript
interface DelegationToken {
  issuer: string;
  subject_agent: string;
  allowed_actions: string[];
  resource_scope: Record<string, unknown>;
  constraints: {
    common?: Record<string, unknown>;
    domain?: Record<string, unknown>;
    expires_at: string;
  };
  approval_reference?: string;
  requester_identity?: RequesterIdentity;
  signature: string;
}
```

## 9. Policy Enforcement

### 9.1 Policy Checks

Before execution, micro-agents perform policy checks:

1. **Authentication Check**: Verify requester identity
2. **Authorization Check**: Verify delegation token validity
3. **Risk Assessment**: Evaluate risk level against constraints
4. **Constraint Validation**: Verify operational constraints
5. **Resource Scope Check**: Verify resource access permissions

### 9.2 Approval Requirements

| Risk Level | Approval Required |
|------------|-------------------|
| low | Never |
| medium | Conditional (configurable) |
| high | Always |
| critical | Always + Enhanced verification |

## 10. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid request format |
| AUTHENTICATION_ERROR | 401 | Invalid credentials |
| AUTHORIZATION_ERROR | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Task state conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

## 11. Version Negotiation

Clients can request specific schema versions:

```
GET /dispatch
X-MAP-Requested-Schema-Version: 1.0.0
```

Servers respond with the negotiated version:

```json
{
  "ok": true,
  "data": {
    "executed_schema_version": "1.0.0"
  }
}
```

## 12. References

- OpenAPI Specification: `schemas/openapi.yaml`
- JSON Schemas: `schemas/*.json`
- Security Model: `docs/security-model.md`
- Authentication: `docs/authentication-model.md`