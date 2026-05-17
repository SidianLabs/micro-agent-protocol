<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Tenant Boundary Semantics (v1-rc)

## Core Invariants

1. Tenant isolation is deny-by-default.
2. Task, receipt, token, and audit lookups MUST be tenant-partitionable.
3. Cross-tenant reads/writes MUST fail unless explicitly delegated.

## Runtime Rules

1. `tenant_id` filters MUST constrain list and get endpoints.
2. Dispatch in strict-tenant mode MUST reject missing tenant context.
3. Receipt and task retrieval with mismatched tenant filter MUST return not-found semantics.

## Observability Rules

1. Security and policy events SHOULD include tenant context when available.
2. Tenant metrics MUST not leak cross-tenant counters in filtered views.
