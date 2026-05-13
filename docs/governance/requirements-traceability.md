# MAP Requirements Traceability Matrix

This matrix maps frozen normative requirements in `docs/protocol-core-v1.md` to current implementation evidence and remaining gate work.

## Legend

- `Implemented (reference)`: present in reference runtime with tests.
- `Partial`: behavior exists but gate-level hardening/evidence is incomplete.
- `Planned`: requirement is defined but implementation/evidence is outstanding.

| Requirement | Core Source | Status | Evidence (current) | Remaining for Gate Closure |
|---|---|---|---|---|
| Task envelope required | Core §1 Core Guarantees | Implemented (reference) | schema validation in `reference/src/validation/schema-validator.ts`; invalid request tests in `reference/test/server.test.ts` | Maintain schema compatibility discipline through `v1.0.0-rc1` freeze |
| Scoped delegation token required | Core §1 + §4 Token Requirements | Implemented (reference) | delegation verification tests in `reference/test/micro-agent.test.ts` | Production trust defaults (`verified`/`regulated`) and key lifecycle hardening |
| State-changing execution emits receipt | Core §1 + §7 Compliance & Conformance | Implemented (reference) | dispatch/receipt tests in `reference/test/server.test.ts` | Signed evidence publication as release artifact |
| Policy evaluated before execution | Core §1 Core Guarantees | Implemented (reference) | policy/orchestrator tests in `reference/test/policy.test.ts`, `reference/test/orchestrator.test.ts` | No known bypasses across dispatch/approve conformance suites |
| Exact target agent binding | Core §3 Dispatch and Approval | Implemented (reference) | capability mismatch tests in `reference/test/server.test.ts` | Keep deterministic behavior covered in conformance suites |
| Dispatch idempotency | Core §3 Dispatch and Approval | Implemented (reference) | idempotency tests in `reference/test/server.test.ts`, `reference/test/task-store.test.ts` | Harden exactly-once effects for production profile |
| Approval integrity chain | Core §3 Dispatch and Approval | Implemented (reference) | approval-state tests in `reference/test/server.test.ts` | Preserve auth parity between dispatch and approve in production controls |
| Token replay prevention | Core §4 Token Requirements | Implemented (reference) | replay test in `reference/test/micro-agent.test.ts` | Extend replay hardening under race/skew conditions |
| Output minimization modes | Core §1 Core Guarantees (output visibility) | Partial | visibility modes implemented; defaults and profile assertions are partially covered | Finalize profile-level guarantees and conformance assertions |
| Terminal state immutability | Core §5 Lifecycle and Errors | Implemented (reference) | transition tests in `reference/test/task-store.test.ts` | Add atomic transition guarantees across storage boundaries |
| Structured error contract | Core §5 Lifecycle and Errors | Implemented (reference) | error response tests in `reference/test/server.test.ts` | Lock compatibility policy for stable v1 candidate |
| Version negotiation contract | Core §6 Versioning and Tenancy | Implemented (reference) | requested/executed version tests in `reference/test/server.test.ts` | Freeze translation/rejection behavior for rc1 |
| Tenant partitioning | Core §6 Versioning and Tenancy | Implemented (reference) | tenant filter tests for tasks/receipts/audit/alerts | Expand isolation abuse/fairness testing for production |
| Tamper-evident receipt/audit | Core §7 Compliance and Conformance | Implemented (reference) | audit hash-chain and signed export tests | Strengthen immutable retention posture for regulated deployments |
| Immutable audit storage posture | Core §7 Compliance and Conformance | Partial | signed audit chain exists; immutable backend controls pending | Implement retention/immutability controls for production v1 |
| Independent implementation conformance evidence | Core §7 Compliance and Conformance | Planned | conformance suites and contract exist in repo | Validate at least two independent implementations before production declaration |
