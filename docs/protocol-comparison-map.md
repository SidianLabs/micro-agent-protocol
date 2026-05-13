# MAP Protocol Comparison and Implementation Priorities

## Purpose

This note compares MAP against the three adjacent protocol families we are actively studying:

- MCP: local/remote tool and resource connectivity
- A2A: agent-to-agent task collaboration
- ACP: high-trust commerce and delegated payment flows

The goal is not to copy them blindly. The goal is to identify which patterns MAP should adopt so it becomes a strong security-first micro-agent protocol for high-impact execution domains.

Local reference sources used for this pass:

- `references/protocols/mcp`
- `references/protocols/a2a`
- `references/protocols/acp`

## What Each Protocol Optimizes For

### MCP

MCP is strongest at standardizing how an AI system connects to tools, resources, prompts, and transports.

Key takeaways from the local MCP sources:

- The spec repo is schema-first and tooling-friendly, with generated JSON Schema published from a canonical source.
- Security guidance is explicit that tool/resource power is real and that clients/operators must model trust carefully.
- Long-running work and tracing are being treated as first-class protocol concerns rather than left as app-specific conventions.

Relevant local sources:

- `references/protocols/mcp/README.md`
- `references/protocols/mcp/SECURITY.md`
- `references/protocols/mcp/seps/1686-tasks.md`
- `references/protocols/mcp/seps/414-request-meta.md`

### A2A

A2A is strongest at agent-to-agent collaboration with explicit task lifecycle, discovery, modality negotiation, and auth-aware task continuation.

Key takeaways from the local A2A sources:

- A2A has a clean split between canonical data model, abstract operations, and protocol bindings.
- The Agent Card is a strong discovery primitive with auth schemes, capabilities, and optional authenticated extended cards.
- Task lifecycle, push notifications, streaming, and `AUTH_REQUIRED` flows are deeply specified.
- The spec insists on a single normative source and regeneration of downstream artifacts.

Relevant local sources:

- `references/protocols/a2a/docs/specification.md`
- `references/protocols/a2a/specification/a2a.proto`

### ACP

ACP is strongest at high-trust, tightly scoped commerce flows where authority must be constrained, versioned, and auditable.

Key takeaways from the local ACP sources:

- ACP uses versioned OpenAPI and JSON Schema snapshots instead of hand-wavy drafts.
- Discovery is explicit via `/.well-known/acp.json`.
- Capability negotiation is intersection-based and session-aware.
- Delegate payment is tightly constrained by allowance, idempotency, and explicit error contracts.
- Several flows are intentionally write-only or minimally echoed back, which matches MAP's security posture.

Relevant local sources:

- `references/protocols/acp/README.md`
- `references/protocols/acp/rfcs/rfc.discovery.md`
- `references/protocols/acp/rfcs/rfc.capability_negotiation.md`
- `references/protocols/acp/rfcs/rfc.delegate_payment.md`
- `references/protocols/acp/rfcs/rfc.intent_traces.md`

## What MAP Should Adopt

### 1. Stronger canonical-source discipline

MAP should behave more like A2A and MCP here.

Needed direction:

- Pick one canonical source of truth for wire contracts.
- Generate SDK types and validation artifacts from that source.
- Stop tolerating cross-SDK contract drift.

Why:

- A2A uses a normative proto.
- MCP keeps schema generation tightly coupled to canonical definitions.
- ACP publishes versioned machine-readable snapshots.

For MAP, this is mandatory because security protocols fail when different SDKs serialize different meanings.

### 2. Discovery should become first-class and layered

MAP already has descriptor discovery, but it should be expanded using lessons from A2A Agent Cards and ACP well-known discovery.

Needed direction:

- Add a well-known discovery document for provider/root-level bootstrapping.
- Keep signed per-agent descriptors as the deeper execution contract.
- Support public descriptor view plus authenticated/extended descriptor view.
- Separate provider discovery from per-task capability negotiation.

Why:

- A2A shows that discovery and auth-aware disclosure should be separate concerns.
- ACP shows that unauthenticated discovery is useful if it stays high-level and cacheable.

### 3. Capability negotiation should be explicit, not implicit

MAP should move toward negotiated compatibility instead of assuming that static descriptor fields are enough.

Needed direction:

- Add request/response capability negotiation for invocation-time features.
- Return intersection-based negotiated results.
- Keep static descriptor metadata for stable capabilities only.
- Treat schema version selection as one slice of a larger negotiation model.

Why:

- ACP handles this very well with intersection semantics.
- MAP will need it for approvals, visibility, evidence level, callbacks, async behavior, and intervention support.

### 4. Authorization delegation needs a richer state machine

MAP already has approval gating, but A2A's `AUTH_REQUIRED` model is a useful precedent.

Needed direction:

- Support richer “execution paused pending external authorization” semantics.
- Distinguish approval, delegated auth, step-up auth, and human intervention.
- Allow clients to continue a task after auth resolution without inventing a new protocol shape each time.
- Support chained delegation across multiple agents/services.

Why:

- This is directly relevant to the PayPal-like example you described.
- MAP should be the protocol that lets the main assistant request action while the provider-owned micro-agent owns the actual authority checks and user-safe continuation.

### 5. Long-running tasks need first-class polling and event delivery

MAP has partial async support today, but MCP tasks and A2A task lifecycle both suggest the next step.

Needed direction:

- Formal task object model across all transports.
- Deterministic polling contract.
- Optional push/webhook delivery for long-running jobs.
- Strong late result retrieval semantics.
- Event stream model with stable status transitions.

Why:

- Payment approval, fraud review, KYC, batch DB work, and multi-step enterprise tasks are all naturally long-running.

### 6. Observability and trace propagation should be standardized

Needed direction:

- Add request meta / trace context propagation.
- Standardize correlation IDs across dispatch, delegated execution, callbacks, and receipts.
- Add signed audit correlation for cross-boundary debugging.

Why:

- MCP is already moving on trace context.
- ACP is treating intent traces and write-only analytics data carefully.
- MAP will need forensic-quality observability because its entire value proposition is security and accountability.

### 7. Data minimization should be a protocol feature, not just guidance

Needed direction:

- Formalize redaction classes and output disclosure levels.
- Add “write-only” fields for sensitive or internal evidence.
- Separate user-visible summaries from provider-only audit evidence.

Why:

- ACP’s write-only posture around sensitive attribution and payment-adjacent metadata is a very good model.
- MAP should be even stricter because many micro-agents will sit in front of sensitive systems.

## What MAP Should Keep Distinct

MAP should not become “MCP plus signatures” or “A2A for payments.”

MAP’s differentiator should remain:

- provider-owned execution boundary
- constrained authority handoff
- signed delegation and signed receipts
- tenant-aware auditability
- policy-governed execution over sensitive capabilities

In other words:

- MCP is for using tools and resources
- A2A is for agent collaboration
- ACP is for commerce-specific negotiation and delegated payment
- MAP should be for secure execution delegation into provider-controlled micro-agents

## Concrete MAP Priorities

### P0

- Unify SDK and server contracts around one canonical wire model.
- Keep the default reference runtime generic with no baked-in business agents.
- Introduce a discovery bootstrap document in addition to signed agent descriptors.
- Formalize invocation-time capability negotiation.

### P1

- Expand approval into a richer delegated authorization/intervention lifecycle.
- Add task event streaming and webhook/push support.
- Standardize trace propagation and audit correlation metadata.

### P2

- Add authenticated extended descriptors.
- Formalize redaction/evidence classes.
- Publish versioned machine-readable protocol snapshots per release.

## Notes for the Current Reference Implementation

The current refactor direction in this repo is aligned with these goals:

- the core reference app is now generic and receives explicit agents
- example business agents are being isolated behind opt-in presets
- server configuration and stateless HTTP/auth helpers are being pulled out of the monolith

The next implementation pass should focus on:

1. further decomposing `reference/src/server.ts` by route group
2. introducing a public bootstrap discovery document
3. designing an explicit negotiated invocation contract
4. defining a generic authorization/intervention state machine
