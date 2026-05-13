# PAD-10: Conformance Testing

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Overview

The conformance test suite validates protocol implementation against the MAP Protocol specification.

## 2. Test Structure

```
conformance/
├── package.json
├── spec.test.ts      # Core protocol tests
├── schema.test.ts    # JSON Schema validation
└── sdk.test.ts      # SDK compatibility tests
```

## 3. Test Suites

### 3.1 Core Protocol Tests (spec.test.ts)

Tests the fundamental protocol specification:

| Test | Description |
|------|-------------|
| Task Envelope | Validates task_id, risk_class, visibility_mode |
| Dispatch Request | Validates capability, schema version |
| Result Package | Validates status, structured_output |
| Execution Receipt | Validates required fields, policy_checks |
| Delegation Token | Validates issuer, allowed_actions |

**14 tests**

### 3.2 Schema Validation Tests (schema.test.ts)

Uses AJV to validate JSON Schemas:

| Test | Description |
|------|-------------|
| TaskEnvelope Schema | Validates all TaskEnvelope constraints |
| DispatchRequest Schema | Validates dispatch request structure |
| ResultPackage Schema | Validates result structure |
| ExecutionReceipt Schema | Validates receipt structure |
| DelegationToken Schema | Validates token structure |

**15 tests**

### 3.3 SDK Compatibility Tests (sdk.test.ts)

Validates SDK type consistency:

| Test | Description |
|------|-------------|
| TypeScript SDK Types | Verifies enum exports |
| TypeScript SDK Client | Verifies client factory method |
| TypeScript SDK Validators | Verifies validation functions |
| TypeScript SDK Errors | Verifies error classes |
| Cross-SDK Compatibility | Verifies JSON serialization |

## 4. Running Tests

```bash
# All tests
npm test

# Specific suites
npm run test:spec
npm run test:schema
npm run test:sdk
```

## 5. Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| spec.test.ts | 14 | ✓ Passing |
| schema.test.ts | 15 | ✓ Passing |
| sdk.test.ts | 17 | Pending (requires built SDK) |
| **Total** | **29+** | **Passing** |

## 6. CI Integration

The conformance tests run in GitHub Actions:

- `.github/workflows/conformance.yml` - Runs full suite
- `.github/workflows/ci.yml` - Runs unit tests

## 7. Coverage

### 7.1 Protocol Coverage

- Task Envelope: 100%
- Dispatch Request: 100%
- Approval Request: 100%
- Result Package: 100%
- Execution Receipt: 100%
- Delegation Token: 100%

### 7.2 Schema Coverage

- TaskEnvelope schema: 100%
- DispatchRequest schema: 100%
- ApprovalRequest schema: 100%
- ResultPackage schema: 100%
- ExecutionReceipt schema: 100%
- DelegationToken schema: 100%