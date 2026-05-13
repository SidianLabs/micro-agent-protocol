# MAP Protocol Spec v1 Draft (Normative)

## Status

This document is the normative companion to `docs/protocol-spec.md`.
It defines interoperable requirements for large-scale MAP deployments.

Normative language uses RFC 2119 terms: **MUST**, **SHOULD**, **MAY**.

## 1. Core Guarantees

1. A MAP execution request **MUST** be represented as a `TaskEnvelope`.
2. Execution authority **MUST** be conveyed through a scoped `DelegationToken`.
3. A state-changing execution **MUST** emit an `ExecutionReceipt`.
4. A provider runtime **MUST** evaluate local policy before execution.
5. The assistant side **MUST NOT** receive more output than the selected visibility mode allows.

## 2. Identity and Trust

1. Discovery payloads (`AgentDescriptor`) **MUST** be signature-verifiable.
2. The verifier **MUST** reject unsigned descriptors in production profiles.
3. Signature verification keys **MUST** be discoverable from a provider-published key endpoint.
4. Key identifiers (`kid`) **MUST** be globally unique within a provider trust domain.
5. A verifier **MUST** reject descriptors with revoked keys.

## 3. Dispatch Semantics

1. When `target_agent` is provided, dispatch **MUST** bind execution to that exact agent.
2. Implementations **MUST NOT** silently fallback to a different agent for the same capability.
3. If `target_agent` cannot serve `capability`, server **MUST** return an explicit capability mismatch error.
4. A dispatch request **MUST** be idempotent when `task_id` is reused by the same requester and capability.
5. Duplicate dispatches for the same idempotency identity **MUST** return the existing task state.

## 4. Approval Semantics

1. `/approve` (or equivalent) **MUST** reference a persisted task currently in `awaiting_approval`.
2. Approval references **MUST** be bound to the original task identity and capability.
3. Approval calls **MUST** fail if the original policy decision was not `require_approval`.
4. Approval calls **MUST** be authenticated with at least the same or stronger requirements as dispatch.

## 5. Delegation Token Requirements

1. Tokens **MUST** include issuer, subject, allowed actions, resource scope, requester, and expiry.
2. Runtime **MUST** enforce:
   - action is within `allowed_actions`
   - executed resource is inside `resource_scope`
   - token is not expired
   - signature is valid
3. Tokens **MUST** be short-lived.
4. Implementations **MUST** prevent replay (nonce or equivalent mechanism).

## 6. Output and Context Controls

1. Providers **MUST** support at least `summary`, `structured_only`, and `receipt_only`.
2. Default visibility mode **SHOULD** be `summary` or `structured_only`.
3. Credentials and internal policy internals **MUST NOT** be returned upstream by default.
4. For denied or approval-required outcomes, responses **MUST** remain minimally informative.

## 7. Lifecycle and State Machine

Valid task states:

- `accepted`
- `running`
- `awaiting_approval`
- `completed`
- `failed`
- `denied`
- `revoked`

Rules:

1. Terminal states are `completed`, `failed`, `denied`, `revoked`.
2. A task in terminal state **MUST NOT** transition back to non-terminal state.
3. Async tasks **MUST** expose a pollable status endpoint or event stream.

## 8. Error Contract

Implementations **MUST** return structured errors with:

- `code` (stable string)
- `message` (human-readable)
- `request_id` (trace correlation)

Implementations **SHOULD** include:

- `retryable` (boolean)
- `details` (machine-parsable object)

Minimum standardized codes:

- `invalid_request`
- `invalid_auth`
- `auth_required`
- `agent_not_found`
- `capability_not_found`
- `policy_denied`
- `approval_required`
- `schema_version_unsupported`
- `idempotency_conflict`
- `rate_limited`
- `internal_error`

## 9. Version Negotiation

1. Provider capability descriptors **MUST** declare supported schema versions.
2. Requesters **MAY** request a schema version.
3. Providers **MUST** either:
   - execute requested version directly, or
   - execute a declared compatible translated version, or
   - fail with `schema_version_unsupported`
4. Result and receipt **MUST** include `requested_schema_version` and `executed_schema_version` when relevant.

## 10. Multi-Tenant Requirements

1. Task, token, and receipt objects **MUST** include tenant context in multi-tenant deployments.
2. Cross-tenant dispatch **MUST** be denied unless explicitly delegated.
3. Logs and receipts **MUST** be partitionable by tenant.

## 11. Compliance and Audit

1. State-changing tasks **MUST** produce tamper-evident receipts.
2. Receipt verification **MUST** be possible offline with published trust material.
3. Systems **SHOULD** support immutable receipt storage and retention policy controls.

## 12. Conformance

A MAP implementation claiming production compatibility **MUST** pass:

1. Schema conformance suite.
2. Transport and error contract tests.
3. Trust verification tests (descriptor/token/receipt).
4. Authorization boundary tests (scope/action/replay/tenant isolation).
