# MAP Scale Architecture RFC (Draft)

## Purpose

This document defines the architecture MAP needs to operate at large scale across multiple providers, tenants, and high-risk domains.

## 1. Control Plane Requirements

A production MAP control plane **MUST** provide:

1. durable task lifecycle persistence
2. capability routing with deterministic resolution
3. policy decision service with auditable outputs
4. token issuance with replay-safe semantics
5. receipt ingestion and verification

In-memory-only stores are acceptable only for local development.

## 2. Runtime Topology

Recommended deployment:

1. stateless API layer for dispatch/approve/status
2. queue-backed async execution workers
3. policy service (sync path)
4. token service
5. receipt store
6. audit pipeline

## 3. Task State Durability

Task state **MUST** be persisted with strong consistency for state transitions.

State transition rules:

1. transitions **MUST** be atomic
2. terminal states **MUST** be immutable
3. duplicate terminal writes **MAY** be idempotently accepted

## 4. Idempotency and Exactly-Once Effects

MAP dispatch **MUST** support idempotency keys or equivalent request identity.

For state-changing capabilities:

1. control plane **MUST** provide at-least-once processing with idempotent effect guards, or exactly-once execution where feasible
2. receipts **MUST** reflect deduplicated execution outcomes

## 5. Async Execution and Backpressure

For async tasks:

1. queue depth, worker saturation, and retries **MUST** be observable
2. retry policy **MUST** include jitter and retry ceilings
3. dead-letter handling **MUST** exist for poison messages
4. clients **MUST** have stable polling or event-stream path

## 6. Multi-Tenancy

Large-scale MAP **MUST** isolate tenants in:

1. policy evaluation
2. token issuance and validation
3. task storage
4. receipt storage
5. observability and audit data

Cross-tenant access is deny-by-default.

## 7. SLOs and Reliability Targets

Each deployment **SHOULD** define SLOs for:

1. dispatch availability
2. policy decision latency
3. token issuance latency
4. async completion latency
5. receipt persistence latency

Error budgets and incident triggers **SHOULD** be tied to these SLOs.

## 8. Observability and Forensics

MAP services **MUST** emit correlated telemetry with a stable `request_id`/`task_id`.

Minimum telemetry:

1. structured logs
2. request and queue metrics
3. distributed tracing
4. security audit events (auth failures, policy denies, replay rejections)

## 9. Security Operations

Production deployments **MUST** support:

1. emergency key revocation workflow
2. compromised agent quarantine
3. deny-list and routing disable switches
4. receipt verification replay for incident response

## 10. Data Governance

Implementations **SHOULD** define:

1. retention classes for task/receipt data
2. redaction strategy for stored payloads
3. residency controls for regulated workloads
4. immutable audit options

## 11. Interop and Ecosystem Readiness

To support broad adoption:

1. protocol conformance suite **MUST** be versioned and public
2. SDK behavior **MUST** match protocol conformance outcomes
3. capability descriptors **SHOULD** include compatibility metadata

## 12. Reference-to-Production Evolution Path

Phase A:

1. durable task store
2. idempotency enforcement
3. strict agent-capability resolution

Phase B:

1. queue-backed async runtime
2. tenant isolation model
3. trust and revocation enforcement

Phase C:

1. multi-region failover
2. compliance profiles
3. certification and interop program
