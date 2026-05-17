<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Error Taxonomy (Canonical v1-rc)

## Stability Policy

1. `error.code` is the stable machine contract.
2. `error.message` is human-readable and may change without contract break.
3. New error codes are additive and must be documented before release.
4. Removing or changing meaning of an existing code is a breaking change.

## Canonical Core Codes

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
- `not_found`

## Domain/Operational Extensions

These are valid extension codes used by the reference server for operational APIs:

- `task_not_found`
- `receipt_not_found`
- `alert_not_found`
- `agent_disabled`
- `capability_disabled`
- `admin_agent_disabled`
- `admin_agent_enabled`
- `admin_capability_disabled`
- `admin_capability_enabled`
- `admin_key_revoked`
- `admin_key_unrevoked`

## Compatibility Rules

1. Clients MUST handle unknown error codes gracefully.
2. Servers SHOULD include `retryable` for actionable retries.
3. Servers SHOULD include machine-readable `details` for conflict and policy outcomes.
