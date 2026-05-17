<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol Conformance Certification

This document defines the formal certification levels for MAP Protocol implementations. Each level represents increasing degrees of compliance, security, and production readiness.

---

## Certification Levels Overview

```
Level 1: Protocol Compliant ──► Basic schema + dispatch/approve flow
    │
    ▼
Level 2: Security Verified  ──► Level 1 + signing, replay protection, tenant isolation
    │
    ▼
Level 3: Production Ready    ──► Level 2 + reliability, chaos, DR, backpressure
```

---

## Level 1: Protocol Compliant

**Goal:** The implementation passes basic schema validation and the core dispatch/approve flow.

### Requirements

#### 1.1 Schema Validation

All requests and responses must validate against the MAP JSON Schema definitions.

| Test | Description |
|---|---|
| `schema-validation.test.ts` | Validates `DispatchRequest`, `ApprovalRequest`, `TaskEnvelope`, `ResultPackage`, `ExecutionReceipt` against schemas |
| `schema-negotiation.test.ts` | Validates schema version negotiation and compatibility |

#### 1.2 Core API Flow

The implementation must support the basic task lifecycle.

| Test | Description |
|---|---|
| `dispatch.test.ts` | Task dispatch creates a task and returns a result |
| `approval.test.ts` | Tasks requiring approval flow through the approval workflow |
| `api-surface.test.ts` | All required API endpoints are present and respond correctly |

#### 1.3 Error Code Taxonomy

The implementation must use the standard MAP error codes.

| Test | Description |
|---|---|
| `error-codes.test.ts` | All 24 standard error codes are recognized; correct HTTP status codes returned |

#### 1.4 Required API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/dispatch` | Submit a task for execution |
| `POST` | `/approve` | Approve a pending task |
| `GET` | `/tasks/{taskId}` | Retrieve a task by ID |
| `GET` | `/tasks` | List tasks (with optional filters) |
| `GET` | `/agents` | List available agents |
| `GET` | `/health` | Health check endpoint |

### Evidence Required

- [ ] Test output showing all Level 1 tests passing
- [ ] Screenshot or log of successful dispatch → result flow
- [ ] Screenshot or log of successful approve → result flow
- [ ] Schema validation test results
- [ ] Error code mapping verified

---

## Level 2: Security Verified

**Goal:** The implementation passes all Level 1 requirements plus signing, replay protection, and tenant isolation.

### Requirements

#### 2.1 All Level 1 Requirements

Must pass all Level 1 tests first.

#### 2.2 Request Signing

| Test | Description |
|---|---|
| `signing.test.ts` | Verifies JWS MAPSIG compact serialization, HMAC-SHA256, RSA-SHA256 |
| Cross-SDK signature verification | Python ↔ TypeScript signatures produce identical results for same inputs |

#### 2.3 Replay Protection

| Test | Description |
|---|---|
| `idempotency.test.ts` | Idempotency keys prevent duplicate task creation |
| `nonce-validation.test.ts` | Nonces are validated and rejected on replay |

#### 2.4 Tenant Isolation

| Test | Description |
|---|---|
| `tenant-isolation.test.ts` | Requests scoped to one tenant cannot access another tenant's data |
| `trust-chain.test.ts` | Verification of delegation token chains across tenants |

#### 2.5 Policy Enforcement

| Test | Description |
|---|---|
| `policy.test.ts` | Policy rules are evaluated and enforced (allow/deny/require_approval) |

#### 2.6 Secure Transport

| Requirement | Description |
|---|---|
| TLS 1.3 | All communication over HTTPS with minimum TLS 1.3 |
| mTLS support | Optional mutual TLS for service-to-service authentication |
| API key validation | Server-side validation of signing keys |

### Evidence Required

- [ ] Test output showing all Level 2 tests passing
- [ ] Cross-SDK signature compatibility report
- [ ] Demonstration of nonce rejection on replay
- [ ] Demonstration of tenant isolation (cross-tenant access denied)
- [ ] Policy evaluation logs showing allow/deny decisions
- [ ] TLS configuration verification

---

## Level 3: Production Ready

**Goal:** The implementation passes all Level 2 requirements plus reliability testing, chaos engineering, disaster recovery drills, and backpressure handling.

### Requirements

#### 3.1 All Level 2 Requirements

Must pass all Level 2 tests first.

#### 3.2 Reliability Testing

| Test | Description |
|---|---|
| `chaos-engineering.test.ts` | System behaves correctly under network partitions, latency injection, pod killing |
| `dr-drill.test.ts` | Disaster recovery: backup/restore, failover within RTO |
| `backpressure.test.ts` | Rate limiting, circuit breaking, queue depth management |

#### 3.3 Performance Benchmarks

| Metric | Target |
|---|---|
| Dispatch latency (p50) | < 100ms |
| Dispatch latency (p99) | < 500ms |
| Throughput (sustained) | > 1000 dispatches/second |
| Concurrent connections | > 10,000 |
| SSE stream latency | < 50ms first-event |

#### 3.4 Operational Readiness

| Requirement | Description |
|---|---|
| Health checks | `/health` returns accurate component status |
| Metrics | Prometheus-compatible metrics endpoint |
| Structured logging | JSON-formatted logs with trace IDs |
| Graceful shutdown | Drain in-flight requests before shutdown |
| Configuration management | Environment variables and config file support |

#### 3.5 Deployment Evidence

| Requirement | Description |
|---|---|
| Staging environment | At least 7 days of stable operation |
| Production environment | At least 30 days of stable operation |
| Incident response | Documented incident response procedure |
| Monitoring & alerting | Active monitoring dashboards and alert rules |
| Runbook | Operational runbook for common scenarios |

### Evidence Required

- [ ] Test output showing all Level 3 tests passing
- [ ] Performance benchmark report (p50, p99, throughput)
- [ ] Chaos engineering test results
- [ ] Disaster recovery drill report
- [ ] 30-day production stability report
- [ ] Incident response documentation
- [ ] Monitoring dashboard screenshots
- [ ] Operational runbook

---

## Certification Process

### Self-Certification

1. Clone the MAP Protocol repository
2. Run the conformance test suite from `/conformance` against your implementation
3. Collect evidence as specified for each level
4. Submit a certification request via GitHub Issue with the `certification` label
5. Include:
   - Implementation name and version
   - SDK language and version
   - Target certification level
   - All required evidence (links to test output, screenshots, logs)

### Review Process

1. MAP maintainers review the submission
2. Spot-check: random subset of tests re-run by maintainers
3. If passed, the implementation is listed in `CERTIFIED_IMPLEMENTATIONS.md`
4. Certification is valid for 12 months or until a new major protocol version

### Recertification

- Required when a new major protocol version is released
- Required if the implementation changes its signing or security model
- Recommended at least every 12 months

---

## Test File Reference

### Conformance Test Suite (`/conformance/src/`)

| File | Level | Description |
|---|---|---|
| `dispatch.test.ts` | L1 | Task dispatch functionality |
| `approval.test.ts` | L1 | Task approval workflow |
| `api-surface.test.ts` | L1 | API surface compliance |
| `error-codes.test.ts` | L1 | Error code taxonomy |
| `schema-negotiation.test.ts` | L1 | Schema version negotiation |
| `validation.test.ts` | L1 | Request/response validation |
| `signing.test.ts` | L2 | Cryptographic signature verification |
| `idempotency.test.ts` | L2 | Idempotent operations |
| `tenant-isolation.test.ts` | L2 | Tenant data isolation |
| `trust-chain.test.ts` | L2 | Trust chain verification |
| `policy.test.ts` | L2 | Policy evaluation |
| `async-queue.test.ts` | L2 | Async delivery queue |
| `task-store.test.ts` | L2 | Task persistence |
| `receipt-store.test.ts` | L2 | Receipt storage |
| `chaos-engineering.test.ts` | L3 | Chaos engineering |
| `dr-drill.test.ts` | L3 | Disaster recovery |
| `backpressure.test.ts` | L3 | Backpressure handling |

---

## Certified Implementations

| Implementation | Language | Level | Certified Date | Expires |
|---|---|---|---|---|
| _(none yet)_ | — | — | — | — |

_Certification is tracked in `CERTIFIED_IMPLEMENTATIONS.md` in the repository root._
