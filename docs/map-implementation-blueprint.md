# MAP Implementation Blueprint

## Purpose

This document defines what MAP should implement next to become a widely adoptable protocol and framework for provider-controlled micro-agent execution.

It is intentionally written as a MAP-native plan. It does not assume the reader has context from adjacent protocols. The goal is to state clearly:

- what MAP is standardizing
- what MAP must keep generic
- what MAP should implement first
- what technical structure will make MAP stable and adoptable

## MAP Core Position

MAP should become the standard boundary between:

- an assistant or upstream agent that plans and requests action
- a provider-owned micro-agent that decides whether and how execution happens

The protocol should optimize for:

- constrained authority
- local policy enforcement
- minimal upstream disclosure
- auditable execution
- safe continuation when approval or intervention is required

MAP should not try to be:

- a generic tool protocol
- a generic multi-agent conversation format
- a replacement for raw APIs
- a framework that assumes one domain such as payments or databases

MAP should be the protocol for secure execution delegation into provider-controlled runtimes.

## What MAP Must Standardize

To be broadly adoptable, MAP needs a small and stable standardized core.

### 1. Provider Discovery

MAP should define a provider-level discovery document that answers:

- who the provider is
- what trust domain it belongs to
- what protocol versions it supports
- where verification keys live
- what transports are available
- what micro-agents and capabilities are exposed

This should be a lightweight bootstrap document. It should not contain sensitive runtime detail.

### 2. Micro-Agent Descriptor

Each micro-agent should expose a signed descriptor that defines:

- agent identity
- version
- provider metadata
- supported capabilities
- risk profile
- input and output schema references
- supported execution modes
- supported visibility modes
- supported authentication schemes
- transport bindings
- capability-specific metadata

Descriptors should be machine-readable, signature-verifiable, and versioned.

### 3. Task Envelope

The task envelope should remain the core request object.

It should represent:

- task identity
- requester identity
- target agent
- intended capability
- intent description
- constraint payload
- tenant context
- delegated authority reference
- requested output and evidence preferences
- trace metadata

The envelope must remain domain-neutral. Domain-specific constraints should live in structured extension fields, not in top-level protocol fields.

### 4. Invocation Negotiation

MAP should explicitly negotiate execution-time compatibility.

Negotiation should cover:

- schema version
- sync versus async execution
- visibility mode
- evidence level
- callback or webhook support
- intervention capabilities
- authentication requirements

The result of negotiation should be returned in a structured form and recorded in task state and receipts.

### 5. Authorization and Intervention Lifecycle

MAP should define a generic intervention state model rather than a single approval-only pause.

MAP should support states such as:

- accepted
- running
- awaiting_approval
- awaiting_authentication
- awaiting_user_input
- awaiting_external_review
- completed
- failed
- denied
- revoked

Each interruption state should have:

- a stable reason code
- a continuation contract
- a minimal user-safe explanation
- optional provider-private evidence

### 6. Result and Receipt Model

MAP responses should separate user-visible output from audit-grade proof.

The result package should contain:

- task status
- summary
- structured output
- follow-up requirement signal
- negotiation metadata
- redaction metadata

The receipt should contain:

- receipt id
- task id
- tenant id if applicable
- request id
- agent id
- action taken
- resources touched in a bounded form
- policy checks
- approval or intervention references
- timestamps
- result hash
- schema execution metadata
- signature

### 7. Trust and Verification

MAP should standardize:

- signed descriptors
- signed receipts
- verification key discovery
- key rotation metadata
- revocation behavior
- offline verification rules

Trust material must be publishable and cacheable.

### 8. Error Contract

MAP should expose a stable error model with:

- machine code
- human-readable message
- request id
- retryable flag
- machine-readable details

Errors must be designed as part of the protocol surface, not as ad hoc server behavior.

## What MAP Must Keep Generic

Broad adoption depends on avoiding hard-coded assumptions.

MAP should never hard-code:

- one specific agent type
- one business domain
- one policy engine
- one storage backend
- one deployment topology
- one signing algorithm only
- one intervention path
- one transport

MAP should allow providers to implement:

- domain-specific schemas
- custom policy hooks
- different runtime adapters
- internal-only evaluation logic
- provider-specific enforcement details

The protocol should define the boundary behavior, not the provider’s internal implementation.

## Recommended Repository Structure

MAP should evolve toward a protocol-first repository structure.

Recommended shape:

```text
docs/
  map-implementation-blueprint.md
  protocol/
  architecture/
  sdk/

spec/
  draft/
    canonical/
    json-schema/
    openapi/
    examples/
  v1/
    canonical/
    json-schema/
    openapi/
    examples/

packages/
  typescript/
  python/
  go/

reference/
  src/
    app/
    runtime/
    server/
    sdk/
    examples/
  test/

scripts/
  generate/
  validate/
  release/

conformance/
  protocol/
  transport/
  auth/
  receipts/
  tenancy/
```

The important idea is:

- canonical definitions are separate from generated artifacts
- examples are separate from the reference runtime core
- conformance is a first-class product

## Canonical Contract Strategy

MAP needs one wire contract source of truth.

Recommended rule:

- define one canonical protocol model
- generate JSON Schema, OpenAPI, and SDK types from that model where possible
- never hand-maintain multiple conflicting wire definitions

Every release should publish:

- canonical contract source
- JSON Schema bundle
- OpenAPI artifact
- validated examples
- conformance report

## Reference Runtime Strategy

The reference runtime should be a framework-first implementation, not a demo application.

The core runtime should provide:

- registration of provider micro-agents
- schema validation
- dispatch and continuation handling
- lifecycle persistence
- receipt generation
- trust verification
- rate limiting
- audit logging
- runtime controls

Example provider agents should remain opt-in and live outside the default boot path.

## SDK Strategy

MAP should treat the SDKs as contract implementations, not separate product experiments.

Recommended approach:

- one canonical SDK surface first
- every other SDK derived from the same wire model
- feature parity tracked explicitly
- generated models where practical
- transport behavior tested against the same conformance suite

The SDKs should all expose the same conceptual primitives:

- discovery
- dispatch
- continuation
- task polling
- event consumption
- receipt retrieval
- verification helpers

## Conformance Strategy

Adoption depends on predictability. MAP should provide a serious conformance program.

Required conformance areas:

- schema validation
- discovery compliance
- task lifecycle compliance
- negotiation compliance
- auth and replay protection
- key verification and revocation
- receipt verification
- tenant isolation
- error contract compliance

Providers and SDKs should be testable against the same conformance suite.

## Security Model

MAP should be security-first by default.

That means:

- credentials stay local to provider runtimes
- upstream assistants get only bounded outputs
- delegated authority is scoped and short-lived
- replay prevention is required
- provider-side policy executes before sensitive actions
- state-changing actions emit receipts
- signatures and key discovery are built in

MAP should make the safe path the easiest implementation path.

## Product Features Needed For Real Adoption

### 1. Discovery Bootstrap

Needed so assistants and orchestrators can discover providers with no custom integration.

### 2. Signed Descriptors

Needed so clients can trust what capabilities a provider claims to expose.

### 3. Negotiated Invocation

Needed so clients and providers can evolve independently without hidden incompatibilities.

### 4. Intervention and Continuation

Needed for real-world execution where sensitive tasks often pause mid-flight.

### 5. Evented Task Lifecycle

Needed for long-running operations, external review, and asynchronous workflows.

### 6. Receipts and Verification

Needed for audit, trust, and compliance.

### 7. Tenant Isolation

Needed for enterprise and platform deployment.

### 8. Data Minimization Controls

Needed so providers can return only the minimum safe result to upstream assistants.

## Suggested Phased Implementation Plan

## Phase 1: Stabilize The Core

Implement:

- canonical wire contract
- provider discovery document
- signed micro-agent descriptors
- dispatch and continuation endpoints
- stable task lifecycle
- stable result and receipt objects
- stable structured error contract

Exit criteria:

- one SDK and reference server fully aligned
- no hard-coded default business agents
- validated examples for every core flow

## Phase 2: Make It Trustworthy

Implement:

- key discovery and revocation
- signed receipts
- offline verification helpers
- replay prevention
- stronger tenant partitioning
- conformance suites for trust and lifecycle

Exit criteria:

- receipts verifiable offline
- key rotation and revocation demonstrated
- tenancy and replay tests passing

## Phase 3: Make It Operational

Implement:

- task event streaming or webhooks
- intervention continuation flows
- richer runtime controls
- metrics and audit exports
- provider bootstrap caching behavior

Exit criteria:

- long-running tasks fully supported
- intervention states standardized
- operational observability built in

## Phase 4: Make It Ecosystem-Ready

Implement:

- aligned Python and Go SDKs
- versioned release artifacts
- provider conformance profiles
- deployment guides for common provider patterns
- extension mechanism for domain-specific capability packs

Exit criteria:

- multiple SDKs aligned to one contract
- versioned protocol artifacts published
- providers can implement MAP without reverse-engineering the reference runtime

## The Most Important Design Rule

MAP should define a narrow, stable, enforceable protocol boundary.

If MAP tries to standardize provider internals, it will become too rigid.
If MAP fails to standardize the boundary strongly enough, it will drift and fragment.

The right balance is:

- strict on the wire
- flexible behind the provider runtime

## Recommended Next Actions

1. Freeze a canonical MAP wire model.
2. Publish a provider discovery bootstrap document.
3. Define negotiated invocation as a first-class protocol object.
4. Expand approval into a generic intervention state machine.
5. Align all SDKs to the same contract.
6. Publish versioned spec artifacts and validated examples.
7. Build conformance into the release process.

## Final Goal

MAP should become the default way for assistants to request sensitive execution from provider-owned systems without receiving raw system authority.

If implemented correctly, MAP will let the world adopt assistants more broadly because providers will finally have a standard way to expose powerful capabilities safely.
