<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Security Model

## Overview

This document defines the security model for Micro Agent Protocol (MAP) under the refined deployment model:

- an external assistant requests work
- a company-owned micro-agent decides how that work is executed
- the protected system remains behind the micro-agent boundary

MAP is built on the assumption that the biggest security failure in assistant systems is giving too much authority, too much context, and too much data access to the assistant itself.

MAP reduces that risk by moving execution into narrow, company-controlled micro-agents and making authority explicit, temporary, local, and auditable.

## Security Objectives

MAP is designed to satisfy the following objectives:

- prevent broad authority from accumulating in the external assistant
- keep sensitive credentials close to the systems that use them
- require local policy evaluation before sensitive execution
- minimize upstream context and data leakage
- ensure every state-changing action is attributable
- reduce the blast radius of prompt injection or assistant misbehavior

## Threat Model

MAP assumes the following threats are realistic.

### 1. Assistant Misalignment

An external assistant may misunderstand intent, over-act, or be influenced by prompt injection or context confusion.

### 2. Overpowered Assistant Integrations

An assistant may be given direct access to dangerous capabilities such as payments, database writes, administrative actions, or sensitive internal APIs.

### 3. Upstream Context Leakage

Sensitive output may be pushed into the assistant context when raw system responses, internal traces, or large data payloads are returned upstream.

### 4. Credential Misuse

Credentials exposed to the assistant or a shared integration layer may be reused outside the intended task.

### 5. Policy Bypass

High-risk actions may occur without deterministic checks if policy is treated as an application detail instead of a protocol-level control.

### 6. Unbounded Delegation

A micro-agent may gain or pass on more authority than the original request should allow.

## Security Principles

### Company-Owned Execution

Execution authority should stay with the organization that owns the underlying system, not with the external assistant.

### Capability Scoping

Each micro-agent should expose only a narrow declared capability surface.

### Credential Locality

Secrets, signing keys, and execution credentials should remain local to the micro-agent runtime or a trusted vault adjacent to it.

### Task-Scoped Authority

Authority should be granted through short-lived delegation tokens scoped by:

- action
- resource
- requester
- time window
- thresholds
- approval state

### Policy Before Execution

High-risk actions should be evaluated against local policy before state changes occur.

### Output Minimization

The default response back to the assistant should be a minimal structured result plus receipt, not the full internal execution trace.

### Verifiable Audit

State-changing actions should generate tamper-evident execution receipts.

## Trust Boundaries

MAP should define these trust boundaries explicitly:

1. user to external assistant
2. external assistant to MAP control plane
3. control plane to company micro-agent
4. company micro-agent to local adapter
5. local adapter to underlying system

## Signing and Signature Verification

### Signature Format

MAP uses a custom signature format (`MAPSIG`) based on JWS-like compact serialization:

```
base64url(header).base64url(payload).base64url(signature)
```

**Header:**
```json
{
  "alg": "HS256" | "RS256",
  "kid": "<key-id>",
  "typ": "MAPSIG"
}
```

**Payload:** Structure varies by scope (see below).

### Signature Scopes

MAP defines the following signature scopes:

| Scope | Description | Contents |
|-------|-------------|----------|
| `descriptor` | Agent descriptor signing | Full agent descriptor fields |
| `delegation_token` | Delegation token signing | issuer, subject_agent, allowed_actions, resource_scope, constraints, approval_reference, requester_identity |
| `receipt` | Execution receipt signing | receipt_id, task_id, tenant_id, request_id, agent_id, action_taken, resource_touched, policy_checks, approval_used, timestamp, result_hash, negotiation |
| `http_request` | HTTP request signing | method, path, timestamp, key_id, body |
| `audit_checkpoint` | Audit checkpoint signing | checkpoint_id, created_at, last_chain_index, last_event_hash, key_id |
| `audit_export` | Audit export signing | Full audit export |
| `conformance_export` | Conformance export signing | Full conformance export |
| `trust_bundle` | Trust bundle signing | Full trust bundle |

### Key Management

MAP supports two signature algorithms:
- **HS256**: HMAC with SHA-256 (symmetric, faster, suitable for testing)
- **RS256**: RSA with SHA-256 (asymmetric, production-ready)

Key status lifecycle:
- `active`: Key can be used for signing and verification
- `retiring`: Key is being phased out, should not be used for new signatures
- `revoked`: Key is compromised or no longer valid, signatures from it should be rejected

### HTTP Request Signing

HTTP requests must include the following headers:

| Header | Description |
|--------|-------------|
| `x-map-auth-scheme` | Must be `signed_request` |
| `x-map-key-id` | The key ID used for signing |
| `x-map-timestamp` | ISO 8601 timestamp |
| `x-map-request-signature` | The signature |

**Timestamp Validation:**
- Request timestamp must be within ±5 minutes of server time
- Prevents replay attacks using old signed requests

### Replay Prevention

MAP implements replay prevention through:
1. Timestamp validation (±5 minute window)
2. Per-request signatures (not reusable)
3. Optional idempotency keys for dispatch operations

## Error Codes

All API errors use standardized error codes:

| Code | HTTP Status | Retryable | Description |
|------|-------------|-----------|-------------|
| `agent_not_found` | 404 | No | Target agent not in registry |
| `agent_disabled` | 403 | No | Agent disabled in runtime controls |
| `capability_not_found` | 404 | No | Capability not registered |
| `capability_disabled` | 403 | No | Capability disabled in runtime controls |
| `policy_denied` | 403 | No | Policy evaluation denied execution |
| `approval_required` | 202 | No | High-risk action requires approval |
| `approval_denied` | 403 | No | Approval request was denied |
| `approval_expired` | 410 | No | Approval window has passed |
| `invalid_delegation_token` | 401 | No | Delegation token is malformed or invalid |
| `token_expired` | 401 | No | Delegation token has expired |
| `token_invalid_signature` | 401 | No | Token signature verification failed |
| `token_missing_scope` | 403 | No | Token doesn't include required scope |
| `schema_validation_failed` | 400 | No | Request body failed schema validation |
| `schema_version_unsupported` | 400 | No | Requested schema version not supported |
| `schema_negotiation_failed` | 400 | No | Client/server schema negotiation failed |
| `tenant_mismatch` | 400 | No | Tenant ID in request doesn't match token |
| `rate_limit_exceeded` | 429 | Yes | Request rate limit exceeded |
| `request_timeout` | 408 | Yes | Request processing timed out |
| `internal_error` | 500 | Yes | Internal server error |
| `invalid_request` | 400 | No | Request is malformed |
| `idempotency_conflict` | 409 | No | Idempotency key reused with different payload |
| `resource_not_found` | 404 | No | Requested resource not found |
| `unauthorized` | 401 | Yes | Authentication required |
| `forbidden` | 403 | No | Insufficient permissions |

## Security Considerations

### Prompt Injection

MAP protects against prompt injection through:
1. Strict input validation with JSON Schema
2. Policy evaluation before any execution
3. Delegation tokens with explicit scope
4. Output minimization (limited data returned upstream)

### Credential Exposure

Credentials are protected by:
1. Secrets never exposed to external assistants
2. Signing keys remain local to control plane
3. mTLS support for service-to-service communication
4. Short-lived delegation tokens

### Data Leakage

Data leakage is prevented through:
1. Visibility modes (receipt_only, redacted, summary)
2. Redaction of sensitive fields
3. Minimized context in upstream responses
4. Separate data plane from control plane

Security improves when each boundary exposes only the minimum authority and information needed for the next step.

## Why MAP Is Safer Than Direct Tool Access

Without MAP:

- the assistant may call the system directly
- the assistant may see too much raw system output
- the assistant may indirectly become a superuser

With MAP:

- the assistant sends a bounded task
- the company-owned micro-agent applies local rules
- the micro-agent can approve, deny, summarize, redact, or require approval
- the assistant gets only the result that is safe and useful to receive

## Delegation Tokens

Delegation tokens are the central authority primitive in MAP.

They should be:

- short-lived
- task-specific
- capability-scoped
- cryptographically signed or otherwise tamper-evident
- revocable where practical

They should constrain at least:

- allowed actions
- target resources
- limits and thresholds
- expiration time
- approval references
- requester identity or request origin

Micro-agents must refuse execution outside token scope.

## Approval Model

MAP should support three approval classes.

### Automatic Approval

Low-risk tasks may execute automatically when policy conditions are satisfied.

Examples:

- low-risk read queries
- access to non-sensitive derived data

### Conditional Approval

Tasks execute automatically only if explicit conditions are satisfied.

Examples:

- payment under a threshold to an approved merchant
- database read limited to a non-production environment

### Interactive Approval

High-risk tasks require explicit approval before commit.

Examples:

- large transfers
- production database mutations
- privileged data export

## Separation of Planning and Execution

MAP intentionally separates planning from execution.

The external assistant may:

- interpret requests
- gather context
- prepare a candidate action
- select a target capability

The external assistant should not automatically:

- execute sensitive actions directly
- access raw protected credentials
- inherit broad authority merely because it can describe a task

## Context Minimization as a Security Property

MAP treats context minimization as part of the security model.

This matters for systems like databases, search indexes, customer records, and internal APIs, where the security problem is not only execution risk but also excessive upstream data exposure.

Micro-agents should be able to:

- filter
- aggregate
- summarize
- redact
- enforce field-level visibility

before returning a result to the assistant.

## Output Controls

To reduce leakage risk, micro-agents should support explicit output modes:

- `summary`
- `structured_only`
- `receipt_only`
- `redacted`
- `debug`

The default should avoid returning:

- raw credentials
- internal prompts
- unrestricted chain-of-thought or reasoning traces
- full sensitive datasets
- internal policy traces unless required

## Audit and Receipts

Every state-changing task should produce an execution receipt containing:

- task identifier
- agent identifier
- action taken
- target resource
- policy checks applied
- approval reference if any
- time of execution
- result hash
- signature or tamper-evident proof

Receipts should support:

- operational debugging
- compliance review
- incident response
- dispute resolution

## Recursion and Delegation Depth

MAP implementations should bound or disable recursive delegation by default.

A company micro-agent should not silently become a general orchestrator. If downstream delegation is allowed, it should be:

- explicitly declared
- capability-scoped
- depth-limited
- represented in receipts or audit data

## Failure Handling

MAP should fail closed where possible.

Examples:

- invalid or expired delegation token results in denial
- missing approval reference blocks commit
- schema mismatch blocks execution
- unavailable policy service should not silently widen authority

## Security Posture Summary

MAP treats the external assistant as useful but not inherently trusted with execution authority over protected systems.

Its security model can be summarized as:

- company-owned execution
- local credentials
- narrow capabilities
- short-lived authority
- deterministic approvals
- minimal upstream output
- auditable results
