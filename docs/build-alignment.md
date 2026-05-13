# MAP Build Alignment Review

## Purpose

This document checks the current repository against the original MAP idea:

- external assistants should not directly own sensitive execution
- organizations should deploy their own narrow micro-agents
- micro-agents should act as both trust boundaries and context boundaries
- MAP should stay broad and provider-friendly, not collapse back into raw tool exposure

## Current Alignment

### 1. Company-Owned Execution

Aligned.

The reference architecture and runtime consistently model:

- an external assistant as requester
- a provider or organization as executor
- micro-agents as the controlled interface to sensitive systems

### 2. Micro-Agent Narrowness

Aligned.

The reference implementation uses provider-owned, capability-scoped examples:

- `PaymentAgent`
- `DBReadAgent`

This matches the thesis that MAP sits between raw tools and heavyweight peer agents.

### 3. Context Minimization

Aligned.

The protocol and examples consistently favor:

- structured output
- approval states
- receipts
- summarized results instead of raw internal traces

This is one of the strongest parts of the current build.

### 4. Local Policy and Bounded Authority

Aligned.

MAP currently includes:

- policy decisions before execution
- signed delegation tokens
- approval pause/resume
- capability-scoped auth requirements

That is consistent with the original security motivation.

### 5. Provider-Friendly Deployment Model

Aligned.

The docs clearly describe MAP as a framework and protocol that third parties build on top of, not a fixed catalog of agents owned by MAP itself.

## Current Gaps

### 1. Cryptography Is Still Reference-Grade

Partially aligned.

The repo now treats signatures and descriptor trust as first-class protocol concerns and supports both `HS256` and `RS256` profiles, including signed request flows, key discovery metadata, runtime revocation controls, and signed audit/conformance exports.

This is strong for a reference runtime.

It is **not** yet the final production trust model because asymmetric trust is not fully enforced as the default for all production profiles and external issuer/KMS operations are still evolving.

### 2. Key Distribution Is Only an Early Draft

Partially aligned.

The repo now exposes key metadata with pagination/ETag, `active_kid`, rotation hints, JWK mode, and runtime revocation behavior. Remaining gaps are externalized trust bundles, issuer governance, and production KMS/HSM integration.

### 3. Transport Surface Is Still Minimal

Partially aligned.

The HTTP binding is no longer minimal: it supports paginated list endpoints with `ETag`/`If-None-Match`, audit integrity/exports, runtime controls, deployment profile readiness, and signed conformance artifact export. Remaining work is ecosystem-level interoperability hardening across independent implementations and certification workflows.

## Build Guidance

To stay faithful to the MAP idea, future work should continue to prioritize:

1. provider control over execution
2. narrow capability design
3. minimal upstream context
4. explicit trust metadata
5. clear request-time policy and auth semantics

Future work should avoid:

1. turning the orchestrator into the real executor
2. stuffing more raw tool behavior back into the assistant side
3. making micro-agents broad and ambiguous
4. treating audit and trust as optional add-ons

## Current Verdict

The project is still building in the right direction.

The implementation remains faithful to the core MAP idea:

- external assistant as planner
- provider-owned micro-agent as executor
- local policy, bounded authority, and reduced context as the default model

The main thing to watch now is not conceptual drift. It is finishing production trust and ecosystem interoperability so the protocol’s security and portability claims match the implementation.
