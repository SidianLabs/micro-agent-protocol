<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol Core v1 (Normative Core)

Status: Draft Candidate (`v1.0.0-rc1` preparation)

This document contains only normative MAP requirements. Guidance and examples live in `docs/protocol-guidance-v1.md`.

## 1. Core Guarantees

1. Requests MUST be represented as `TaskEnvelope`.
2. Execution authority MUST use scoped `DelegationToken`.
3. State-changing execution MUST emit `ExecutionReceipt`.
4. Runtime MUST evaluate local policy before execution.
5. Output visibility MUST respect requested/allowed mode.

## 2. Identity and Trust

1. `AgentDescriptor` payloads MUST be signature-verifiable.
2. Production profiles MUST reject unsigned descriptors.
3. Verification keys MUST be discoverable via provider endpoint.
4. Revoked keys MUST be rejected.

## 3. Dispatch and Approval

1. `target_agent` binding MUST be strict and deterministic.
2. Capability mismatch MUST return explicit error.
3. Idempotent identity MUST return same task/result envelope.
4. Approval MUST reference persisted `awaiting_approval` tasks only.

## 4. Token Requirements

1. Token MUST include issuer/subject/actions/scope/requester/expiry.
2. Runtime MUST enforce action scope, resource scope, expiry, signature, replay resistance.

## 5. Lifecycle and Errors

1. Terminal states MUST be immutable.
2. Structured error response MUST include `code`, `message`, `request_id`.

## 6. Versioning and Tenancy

1. Capability descriptors MUST declare supported schema versions.
2. Provider MUST execute/translate/reject requested versions deterministically.
3. Multi-tenant deployments MUST enforce tenant partitioning and deny cross-tenant by default.

## 7. Compliance and Conformance

1. State-changing operations MUST produce verifiable receipts.
2. Implementations claiming compatibility MUST pass MAP conformance suites.
