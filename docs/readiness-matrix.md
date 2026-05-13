# MAP v1 Readiness Matrix

Last updated: 2026-04-02

## Scoring

- `0`: not addressed
- `1`: concept draft
- `2`: reference implementation
- `3`: production-ready baseline

## Protocol and Interop

1. Normative protocol semantics: `2`
2. Error contract stability: `2`
3. Idempotency and replay semantics: `2`
4. Version negotiation contract: `2`
5. Conformance test suite: `2`

## Trust and Security

1. Descriptor signing and verification: `2`
2. Delegation token signature verification: `2`
3. Action/resource scope enforcement at runtime: `2`
4. Asymmetric key infrastructure: `2`
5. Revocation and compromise handling: `2`

## Policy and Governance

1. Deterministic pre-execution policy engine: `2`
2. Approval workflow integrity chain: `2`
3. Tenant-aware policy controls: `2`
4. Governance and compliance profiles: `2`

## Runtime and Scale

1. Durable task lifecycle persistence: `2`
2. Queue-backed async model: `2`
3. Retry and dead-letter model: `2`
4. Multi-region and failover strategy: `0`
5. Capacity/SLO operating model: `1`

## Data and Context Safety

1. Output minimization semantics: `2`
2. Redaction controls and defaults: `2`
3. Field-level data governance profile: `2`
4. Immutable audit storage options: `1`

## Ecosystem and Adoption

1. Migration guidance from tool-first ecosystems: `2`
2. SDK guidance and contract tests: `2`
3. Certification model: `0`

## Current Total

- Current score: `47 / 78` (~`60%` toward production-ready baseline)
- Interpretation: strong reference implementation with conformance and signed evidence; major remaining gaps are multi-region operations, certification/interoperability across independent implementations, and production-grade trust operations.
- Governance artifacts (traceability, risk register, milestone/release gate definitions, compliance mapping) are now aligned; implementation hardening items remain the primary blockers.

## Priority Actions (P0/P1/P2)

### P0

1. Publish normative protocol draft and trust RFC.
2. Enforce strict agent-capability binding and approval state integrity.
3. Add runtime action/resource scope enforcement and replay protection.

### P1

1. Introduce durable task store and idempotency guarantees.
2. Define multi-tenant identity model and isolation constraints.
3. Introduce asymmetric key profile and revocation behavior.

### P2

1. Build conformance harness for independent implementations.
2. Add compliance profiles and operator runbooks.
3. Establish certification and ecosystem compatibility program.

## Exit Criteria for v1 Candidate

1. No known authz bypass in dispatch/approval flows.
2. Fully verifiable trust chain for descriptor, token, and receipt.
3. Durable lifecycle and idempotent execution guarantees.
4. Conformance suite pass across at least two independent implementations.
