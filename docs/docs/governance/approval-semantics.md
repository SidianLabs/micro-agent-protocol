<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Approval-Chain Semantics (v1-rc)

## States

- `awaiting_approval` is the only valid pre-approval paused state.

## Rules

1. Approval continuation MUST target an existing persisted task.
2. Task MUST currently be in `awaiting_approval`.
3. Approval reference MUST be bound to the original task identity.
4. Direct approval on non-pending tasks MUST fail.
5. Approval path MUST preserve original tenant and capability constraints.
6. Approval outcome transitions MUST be auditable and receipt-backed.

## Failure Behavior

- Unknown task -> `task_not_found`
- Wrong lifecycle state -> `invalid_request` or `conflict` (implementation-defined but stable)
- Unauthorized approval -> `invalid_auth` or `auth_required`
