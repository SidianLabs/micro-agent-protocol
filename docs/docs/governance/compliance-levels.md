<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Compliance Levels

## Levels

1. `core`
2. `secure`
3. `regulated`

## Mapping to Deployment Profiles

- `open` -> `core`
- `verified` -> `secure`
- `regulated` -> `regulated`

## Minimum Requirements

### core

- protocol envelope validation
- deterministic task lifecycle and terminal-state immutability
- structured error contract (`code`, `message`, `request_id`)
- conformance baseline: reference + error contract checks

### secure

- signed request verification
- replay protection
- tenant-aware controls
- verifiable receipt/audit chain
- conformance baseline: `core` + trust + profile checks

### regulated

- secure requirements plus stricter readiness gates
- tenant-required mode
- asymmetric signing posture
- immutable/retention-aware audit posture
- signed conformance evidence for release promotion

## Gate Alignment

- `core` is sufficient for non-production/open deployments.
- `secure` is minimum for production candidate readiness.
- `regulated` is required for high-assurance production declarations.

This mapping aligns with:

- `docs/deployment-profiles.md`
- `docs/governance/release-gates.md`
- `docs/protocol-core-v1.md`
