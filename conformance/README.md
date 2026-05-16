<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol Conformance Test Suite

This directory contains the conformance test suite for the MAP Protocol implementation. These tests verify that an implementation correctly implements the MAP Protocol specification across all defined interfaces and behaviors.

## Certification Levels

MAP Protocol defines three formal certification levels. See [`docs/conformance-certification.md`](../docs/conformance-certification.md) for details:

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
# Install dependencies
npm install

# Build the test suite
npm run build

# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=dispatch

# Run tests for a specific certification level
npm test -- --testPathPattern="dispatch|approval|api-surface|error-codes|schema-negotiation|validation"  # Level 1
npm test -- --testPathPattern="signing|idempotency|tenant-isolation|trust-chain|policy|async-queue|task-store|receipt-store"  # Level 2
```

### Test Configuration

Tests are designed to run against a reference server at `http://localhost:8787`. Ensure the server is running before executing the test suite.

Override the server URL with environment variables:

```bash
MAP_SERVER_URL=http://your-server:8080 npm test
```

## How to Self-Certify

### Step 1: Prepare Your Implementation

Ensure your MAP Protocol server is running and configured to accept test traffic.

### Step 2: Run Conformance Tests

Run the test suites for your target certification level.

```bash
# Level 1
npm test -- --testPathPattern="dispatch|approval|api-surface|error-codes|schema-negotiation|validation"

# Level 2 (includes Level 1)
npm test

# Level 3 (includes all, plus additional reliability tests)
npm test -- --runChaosTests  # opt-in for destructive tests
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
| `src/tenant-isolation.test.ts` | L2 | Tests for tenant isolation |
| `src/trust-chain.test.ts` | L2 | Tests for trust chain verification |
| `src/policy.test.ts` | L2 | Tests for policy evaluation |
| `src/async-queue.test.ts` | L2 | Tests for async delivery queue |
| `src/task-store.test.ts` | L2 | Tests for task persistence |
| `src/receipt-store.test.ts` | L2 | Tests for receipt storage |
| `src/chaos-engineering.test.ts` | L3 | Tests for chaos engineering |
| `src/dr-drill.test.ts` | L3 | Tests for disaster recovery |
| `src/backpressure.test.ts` | L3 | Tests for backpressure handling |

## Fixtures

Test fixtures are located in `src/fixtures/` and include:
- `valid-dispatch-requests.json` - Valid dispatch request examples
- `invalid-envelopes.json` - Invalid envelope examples
- `signature-fixtures.json` - Cryptographic signature test data
- `policy-fixtures.json` - Policy evaluation scenarios

## Related Resources

- [Conformance Certification Levels](../docs/conformance-certification.md)
- [SDK Compatibility Matrix](../docs/sdk-compatibility-matrix.md)
- [V1 Candidate Checklist](../docs/v1-candidate-checklist.md)
- [MAP Protocol Specification](../spec/)
