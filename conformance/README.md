# MAP Protocol Conformance Test Suite

This directory contains the conformance test suite for the MAP Protocol implementation.

## Purpose

The conformance tests verify that an implementation correctly implements the MAP Protocol specification across all defined interfaces and behaviors.

## Test Suites

- **dispatch.test.ts** - Tests for task dispatch functionality
- **approval.test.ts** - Tests for task approval workflow
- **signing.test.ts** - Tests for cryptographic signature verification
- **validation.test.ts** - Tests for request/response validation
- **schema-negotiation.test.ts** - Tests for schema version negotiation
- **idempotency.test.ts** - Tests for idempotent operations
- **task-store.test.ts** - Tests for task persistence
- **receipt-store.test.ts** - Tests for receipt storage
- **async-queue.test.ts** - Tests for async delivery queue
- **policy.test.ts** - Tests for policy evaluation
- **error-codes.test.ts** - Tests for error code taxonomy
- **trust-chain.test.ts** - Tests for trust chain verification
- **api-surface.test.ts** - Tests for API surface compliance

## Running Tests

```bash
# Build first
npm run build

# Run all tests
npm test
```

## Test Configuration

Tests are designed to run against a reference server at `http://localhost:8787`. Ensure the server is running before executing the test suite.

## Fixtures

Test fixtures are located in `src/fixtures/` and include:
- `valid-dispatch-requests.json` - Valid dispatch request examples
- `invalid-envelopes.json` - Invalid envelope examples
- `signature-fixtures.json` - Cryptographic signature test data
- `policy-fixtures.json` - Policy evaluation scenarios
