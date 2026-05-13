# MAP Trust and Key Management RFC (Draft)

## Purpose

This RFC defines production-grade trust for MAP discovery, delegation, and receipts.
It supersedes demo-only trust assumptions.

## 1. Trust Domains

A MAP trust domain is the set of issuers, keys, policies, and verifiers operating under a shared governance boundary.

Requirements:

1. Each trust domain **MUST** define trusted issuers.
2. Each issuer **MUST** publish verification keys.
3. Clients **MUST** reject signatures from unknown issuers.

## 2. Signature Profiles

MAP defines three signed artifact classes:

1. `descriptor_signature` for discovery metadata
2. `delegation_token` signatures for authority scoping
3. `receipt` signatures for audit evidence

Production profile:

1. Asymmetric algorithms **MUST** be used.
2. Symmetric shared-secret profiles **MAY** be used only for local development.
3. Signature metadata **MUST** include `kid` and `alg`.

## 3. Key Discovery

Providers **MUST** expose a key-discovery endpoint (for example: `/.well-known/map-keys`).

Published key metadata **MUST** include:

- `kid`
- `alg`
- `use`
- `status` (`active`, `retiring`, `revoked`)
- `not_before`
- `not_after`
- supported scopes

Clients **MUST** cache keys with explicit TTL behavior and refresh on unknown `kid`.

## 4. Rotation and Revocation

Rotation requirements:

1. New key published as `active`.
2. Old key transitions to `retiring` for overlap window.
3. New artifacts signed with new active key.
4. Old key becomes `revoked` or removed after migration window.

Revocation requirements:

1. Verifiers **MUST** reject revoked keys immediately after revocation metadata refresh.
2. Providers **SHOULD** support emergency revocation propagation within bounded SLA.

## 5. Token Binding and Replay Resistance

Delegation tokens **MUST** include:

- issuer
- audience (target runtime/service)
- subject agent
- action scope
- resource scope
- requester identity
- issued-at and expiry
- unique nonce or token id

Runtime **MUST**:

1. verify signature and issuer trust
2. verify audience
3. verify time window
4. reject replayed nonce/token id
5. enforce action/resource scope

## 6. Approval Trust Chain

Approval-required flows **MUST** produce verifiable chain:

1. Policy decision that required approval
2. Approval grant artifact (signed or strongly authenticated)
3. Execution receipt referencing approval artifact

Direct approve without prior pending state **MUST NOT** be accepted.

## 7. Receipt Verification Model

Receipts **MUST** be verifiable without contacting the runtime that produced them.

Recommended fields:

- `receipt_id`
- `task_id`
- `agent_id`
- `action_taken`
- `resource_touched` (or anonymized reference)
- `policy_checks`
- `approval_reference` (if used)
- `timestamp`
- `result_hash`
- `kid`
- signature

## 8. Threat Coverage

This trust model explicitly addresses:

1. descriptor tampering
2. token scope escalation
3. replay attacks
4. forged audit receipts
5. compromised key material

## 9. Migration from Reference Implementation

The current reference implementation is intentionally demo-grade.

Migration priorities:

1. Introduce asymmetric signature support in runtime and validator.
2. Publish verifier-friendly key material.
3. Add nonce/replay store for token validation.
4. Add revocation-aware verification in dispatch and runtime paths.

## 10. Conformance Checks

A production MAP trust implementation **MUST** pass:

1. key rotation continuity tests
2. revoked key rejection tests
3. replay rejection tests
4. cross-issuer rejection tests
5. offline receipt verification tests
