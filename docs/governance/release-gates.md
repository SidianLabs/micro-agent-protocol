# MAP Release Gates

## Protocol v1 Candidate (DoD)

All must be true:

1. Normative core is frozen in `docs/protocol-core-v1.md`, with companion guidance in `docs/protocol-guidance-v1.md`.
2. Conformance contract in `docs/governance/conformance-contract-v1.json` is frozen for `v1.0.0-rc1`.
3. All required conformance suites pass in CI (`reference`, `profiles`, `trust`, `fixtures`, `errors`, `api_surface`).
4. Required scripts (`conformance:*` in the contract) execute successfully in the release pipeline.
5. No known authz bypass in dispatch/approve flows.
6. Descriptor/token/receipt/signing-chain verification passes with documented trust model.
7. Durable task lifecycle + idempotency guarantees are test-verified.
8. Signed conformance artifacts are generated and verifiable.
9. SDK contract tests pass against reference server.

## Production v1 (DoD)

All v1-candidate gates plus:

1. `verified` and `regulated` profiles enforce asymmetric trust defaults in production.
2. KMS/HSM-backed key lifecycle and emergency revocation workflow are implemented and exercised.
3. Multi-region failover strategy is implemented and drill-tested.
4. SLO/error-budget policy is implemented with operational alerts.
5. Regulated profile has immutable/retention-aware audit posture.
6. At least two independent implementations pass the frozen conformance contract.
7. Certification/evidence workflow is published and repeatable.

## Notes

- This gate document is authoritative for release promotion and must remain consistent with:
  - `docs/execution-master-plan.md`
  - `docs/readiness-matrix.md`
  - `docs/governance/compliance-levels.md`
- `docs/protocol-spec-v1-draft.md` may continue as historical draft text, but release gating uses the frozen core/guidance split above.
