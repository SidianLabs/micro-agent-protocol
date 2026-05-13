# MAP Execution Master Plan

## Purpose

This is the single source of truth for executing MAP from advanced reference implementation to production-grade protocol and SDK ecosystem.

## Status Model

- `not_started`
- `in_progress`
- `blocked`
- `done`

## Definition of Completion

- Protocol v1 Candidate and Production v1 gates are defined in `docs/governance/release-gates.md`.
- Every completed step must include code/docs changes and verification evidence.

## 60-Step Backlog

| Step | Status | Work Item |
|---|---|---|
| 1 | done | Freeze current-state baseline snapshot and checksum manifest |
| 2 | done | Create this execution master plan as source of truth |
| 3 | in_progress | Refresh readiness matrix to current implemented reality |
| 4 | in_progress | Reconcile stale docs (`reference/README.md`, `docs/build-alignment.md`) |
| 5 | done | Define v1 Candidate and Production v1 definition-of-done |
| 6 | done | Add protocol requirements traceability matrix |
| 7 | done | Establish risk register |
| 8 | done | Define weekly milestone gates with measurable criteria |
| 9 | done | Split protocol text into normative core and guidance |
| 10 | not_started | Formalize `v1.0.0-rc1` versioning/changelog discipline |
| 11 | not_started | Finalize canonical error taxonomy and compatibility guarantees |
| 12 | not_started | Finalize idempotency semantics |
| 13 | not_started | Finalize approval-chain semantics |
| 14 | not_started | Finalize tenant-boundary semantics |
| 15 | not_started | Finalize version-negotiation and translation semantics |
| 16 | done | Add protocol compliance levels mapped to deployment profiles |
| 17 | not_started | Define extension-point policy for vendor-safe additions |
| 18 | done | Publish conformance contract as testable artifacts |
| 19 | not_started | Make asymmetric signing default for verified/regulated |
| 20 | not_started | Add issuer trust anchors and trust-domain model |
| 21 | not_started | Enforce key-use constraints by artifact type |
| 22 | not_started | Enforce algorithm policy by profile |
| 23 | not_started | Integrate KMS/HSM abstraction layer |
| 24 | not_started | Implement emergency key compromise workflow |
| 25 | not_started | Add key lifecycle simulation tests |
| 26 | not_started | Add cross-artifact cryptographic consistency checks |
| 27 | not_started | Publish deterministic signature fixtures |
| 28 | not_started | Add signed trust-bundle export endpoint |
| 29 | not_started | Add replay hardening tests under skew/races |
| 30 | not_started | Add crypto observability/anomaly thresholds |
| 31 | not_started | Encode formal task transition table tests |
| 32 | not_started | Enforce atomic state transitions across stores |
| 33 | not_started | Add monotonic transition guards and conflict errors |
| 34 | not_started | Enforce append-only receipt immutability |
| 35 | not_started | Implement outbox/inbox reliability pattern |
| 36 | not_started | Add exactly-once effect guards |
| 37 | not_started | Harden worker lease/visibility semantics |
| 38 | not_started | Add poison-message quarantine controls |
| 39 | not_started | Add deterministic overload backpressure behavior |
| 40 | not_started | Add lifecycle chaos tests |
| 41 | not_started | Define tenant isolation threat model and abuse tests |
| 42 | not_started | Enforce tenant partitioning across subsystems |
| 43 | not_started | Add per-tenant fairness controls |
| 44 | not_started | Implement shard strategy for task/receipt/audit |
| 45 | not_started | Define regional topology and failover strategy |
| 46 | not_started | Implement replication consistency/failover protocol |
| 47 | not_started | Add DR drills and failover conformance checks |
| 48 | not_started | Operationalize SLO/error budget alerts |
| 49 | not_started | Refactor TS SDK into stable public modules |
| 50 | not_started | Add SDK middleware stack (auth/retry/telemetry/idempotency) |
| 51 | not_started | Add event streaming and long-poll progress interfaces |
| 52 | not_started | Add workflow APIs (dispatch-poll-approve) |
| 53 | not_started | Add typed conformance client APIs |
| 54 | not_started | Start Python SDK baseline |
| 55 | not_started | Publish SDK compatibility matrix |
| 56 | not_started | Add SDK fuzz/property tests |
| 57 | not_started | Publish versioned public conformance harness package |
| 58 | not_started | Define certification levels and evidence requirements |
| 59 | not_started | Validate two independent implementations |
| 60 | not_started | Declare v1 Candidate then Production v1 |

## Execution Cadence

- Complete steps in order unless an explicit dependency requires parallelism.
- Re-score readiness every 5 completed steps.
- No step is `done` without tests and updated docs.
