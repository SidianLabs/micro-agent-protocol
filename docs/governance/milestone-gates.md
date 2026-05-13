# MAP Weekly Milestone Gates

These gates align directly to `docs/execution-master-plan.md` step ranges and should be evaluated in order.

## Gate W1 (Steps 1-8)

Pass criteria:

1. Baseline snapshot + checksums created.
2. Master plan exists and is current.
3. Readiness matrix updated.
4. Stale docs reconciled.
5. DoD, traceability, risk register, and milestones published.

Current checkpoint:

- Governance artifacts for Steps 6-8 are published and aligned.
- W1 still depends on completion of Step 3 (readiness refresh) and Step 4 (stale docs reconciliation).

## Gate W2 (Steps 9-18)

Pass criteria:

1. Protocol v1-rc text stabilized.
2. Error/idempotency/approval/tenant/version semantics finalized.
3. Conformance contract frozen and wired to CI release checks.

## Gate W3 (Steps 19-30)

Pass criteria:

1. Asymmetric production trust defaults in place.
2. Key lifecycle and compromise workflows tested.
3. Trust/export fixtures and crypto observability implemented.

## Gate W4 (Steps 31-40)

Pass criteria:

1. Durable transition table enforced atomically.
2. Exactly-once/idempotent effect guard pattern shipped.
3. Queue reliability and chaos tests passing.

## Gate W5 (Steps 41-48)

Pass criteria:

1. Tenant isolation hardened across subsystems.
2. Regional failover strategy implemented and drilled.
3. SLO/error-budget alerting in place.

## Gate W6 (Steps 49-56)

Pass criteria:

1. Stable SDK surface and middleware model.
2. Streaming/workflow APIs available.
3. Cross-language SDK bootstrap + compatibility matrix.

## Gate W7 (Steps 57-60)

Pass criteria:

1. Public conformance harness versioned.
2. Certification and evidence policy published.
3. Two independent implementations verified.
4. v1 candidate and production declarations completed.

## Coherence Rules

1. W2 and later gates cannot be marked complete while any W1 prerequisite remains open.
2. W7 completion requires satisfying release gates in `docs/governance/release-gates.md`.
3. Gate status updates must be reflected in both `docs/execution-master-plan.md` and `docs/readiness-matrix.md`.
