# MAP Protocol v1 Guidance (Non-Normative)

This document provides implementation guidance, migration advice, and design patterns that support the normative core in `docs/protocol-core-v1.md`.

## Recommended Profiles

- `open`: local/dev and low-risk experimentation.
- `verified`: signed request verification and stronger controls.
- `regulated`: strongest posture, stricter readiness gates.

## Implementation Guidance

1. Prefer asymmetric trust in production.
2. Keep micro-agents narrowly scoped by capability.
3. Use queue-backed async with dead-letter isolation for side-effecting tasks.
4. Publish signed conformance evidence for release promotion.
5. Keep tenant isolation explicit in storage and observability.

## Migration Guidance

1. Start with discovery + signed requests.
2. Add idempotent dispatch/approve lifecycle.
3. Add receipts and audit verification.
4. Move to stricter profile gates before production cutover.
