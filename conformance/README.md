<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol Conformance Test Suite

This directory contains the preview conformance harness for MAP Protocol implementations.

**Status:** Developer preview. Use it for local compatibility testing and investigation. Do not treat it as polished certification infrastructure yet.

## Certification Levels

MAP defines three intended certification levels. Treat them as target levels for now rather than a fully productized certification program. See [`docs/conformance-certification.md`](../docs/conformance-certification.md) for the current model:

| Level | Name | Description |
|---|---|---|
| **Level 1** | Protocol Compliant | Basic schema validation + dispatch/approve flow |
| **Level 2** | Security Verified | Level 1 + signing, replay protection, tenant isolation |
| **Level 3** | Production Ready | Level 2 + reliability, chaos, DR, backpressure |

## How to Run Conformance Tests

### Prerequisites

- Node.js 18+
- A running MAP Protocol server at `http://localhost:8787`
- npm dependencies installed

### Running Tests

```bash
cd conformance
npm run build
npm test
```

### Test Configuration

Tests are designed to run against a reference server at `http://localhost:8787`.

- With a live server, the harness runs real protocol checks.
- Without a live server, network-dependent tests skip cleanly.
- A run with many skips is not certification evidence; it only means the harness itself executed successfully.

Override the server URL with environment variables:

```bash
MAP_SERVER_URL=http://your-server:8080 npm test
```

## How to Self-Certify

### Step 1: Prepare Your Implementation

Ensure your MAP Protocol server is running and configured to accept test traffic.

### Step 2: Run Conformance Tests

Run the harness against a live implementation and review the results manually.

```bash
npm test
```

### Step 3: Collect Evidence

For each certification level, collect the following evidence:

**Level 1:**
- [ ] Terminal output showing all tests passing
- [ ] Screenshot or log of successful `dispatch` → `result` flow
- [ ] Screenshot or log of successful `approve` → `result` flow

**Level 2 (adds):**
- [ ] Cross-SDK signature compatibility report
- [ ] Nonce rejection demonstration
- [ ] Cross-tenant access denial demonstration
- [ ] Policy evaluation logs

**Level 3 (adds):**
- [ ] Performance benchmark report (p50, p99, throughput)
- [ ] Chaos engineering test results
- [ ] Disaster recovery drill report
- [ ] 30-day production stability report

### Step 4: Submit Certification Request

Create a [GitHub Issue](https://github.com/SidianLabs/micro-agent-protocol/issues/new) with the `certification` label, including:

1. Implementation name and version
2. SDK language and version
3. Target certification level
4. Links to all required evidence

Until the workflow is hardened further, frame this as a review request rather than an automated stamp of compliance.

## Test Suites

| Test File | Level | Description |
|---|---|---|
| `src/dispatch.test.ts` | L1 | Tests for task dispatch functionality |
| `src/approval.test.ts` | L1 | Tests for task approval workflow |
| `src/api-surface.test.ts` | L1 | Tests for API surface compliance |
| `src/error-codes.test.ts` | L1 | Tests for error code taxonomy |
| `src/validation.test.ts` | L1 | Tests for request/response validation |
| `src/schema-negotiation.test.ts` | L1 | Tests for schema version negotiation |
| `src/signing.test.ts` | L2 | Tests for cryptographic signature verification |
| `src/idempotency.test.ts` | L2 | Tests for idempotent operations |
| tenant isolation coverage | L2 | Covered through the current harness and security/policy checks |
| `src/trust-chain.test.ts` | L2 | Tests for trust chain verification |
| `src/policy.test.ts` | L2 | Tests for policy evaluation |
| `src/async-queue.test.ts` | L2 | Tests for async delivery queue |
| `src/task-store.test.ts` | L2 | Tests for task persistence |
| `src/receipt-store.test.ts` | L2 | Tests for receipt storage |
| reference reliability coverage | L3 | Reliability checks are currently stronger in the reference implementation test suite than in this standalone harness |

## Fixtures

Test fixtures are located in `src/fixtures/` and include:
- `valid-dispatch-requests.json` - Valid dispatch request examples
- `invalid-envelopes.json` - Invalid envelope examples
- `signature-fixtures.json` - Cryptographic signature test data
- `policy-fixtures.json` - Policy evaluation scenarios

## Related Resources

- [Conformance Certification Levels](../docs/conformance-certification.md)
- [SDK Compatibility Matrix](../docs/docs/sdk/compatibility-matrix.md)
- [MAP Protocol Specification](../spec/)
