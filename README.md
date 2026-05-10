# Micro Agent Protocol (MAP)

Micro Agent Protocol (MAP) is a framework and protocol standard for deploying small, company-owned micro-agents between external AI assistants and sensitive systems.

MAP is designed for a world where users interact with a general assistant such as ChatGPT, Claude, Copilot, or an enterprise orchestration layer, but the real execution authority remains with the organization that owns the underlying system.

In MAP:

- the external assistant handles user interaction, planning, and broad reasoning
- the organization deploys its own micro-agents behind a MAP boundary
- those micro-agents enforce local policy, use local tools, and return only the minimum useful result

The goal is to make safe delegated execution easy to deploy without giving the main assistant direct access to powerful tools, credentials, or large internal data surfaces.

## Core Thesis

Modern agent systems are missing a middle layer.

Today, the usual choices are:

- raw tools exposed through protocols like MCP
- heavyweight peer-agent communication models like A2A

MAP introduces a third model:

- small, capability-scoped micro-agents deployed by the company that owns the system

Instead of:

`assistant -> raw tool`

MAP uses:

`assistant -> company MAP micro-agent -> local system`

That shift changes who controls execution, who holds credentials, how much context is exposed, and where policy is enforced.

## Why MAP Exists

MAP exists to solve three linked problems in production agent systems:

- Context overload: the assistant receives too much raw schema, trace, and system output.
- Over-centralized authority: the assistant ends up with direct access to dangerous capabilities.
- Weak trust boundaries: sensitive execution is represented as simple tool calls instead of local, policy-aware decisions.

MAP solves those problems by turning direct tool access into controlled delegation.

## What MAP Is

MAP is:

- a protocol for assistant-to-micro-agent delegation
- a framework for companies to deploy their own micro-agents
- a trust boundary between general assistants and sensitive systems
- a context boundary that compresses and redacts what goes back upstream

MAP is not:

- a replacement for all APIs
- a peer-to-peer agent social layer
- a framework for making the main assistant more powerful by default

## Canonical Use Cases

### Payments

A payment company such as PayPal can deploy MAP micro-agents that handle:

- merchant validation
- fraud and risk checks
- approval rules
- payment execution
- receipts and audit trails

The external assistant can gather user intent and seller information, but the company-owned payment micro-agent decides whether the payment can proceed.

### Databases

A company can deploy a `DBReadAgent` or `DBWriteAgent` in front of internal databases.

Instead of exposing a broad database tool to the main assistant, the micro-agent:

- runs the query locally
- filters or aggregates results
- applies access policy
- returns only the answer or summary needed upstream

This reduces both security risk and context growth.

### Internal Enterprise Systems

MAP fits any system where execution should stay local to the owner of the resource:

- CRM
- ERP
- internal APIs
- document systems
- local files
- compliance workflows
- production operations

## High-Level Architecture

MAP has five main layers:

1. External Assistant
   The user-facing agent that interprets intent and delegates tasks.

2. MAP Control Plane
   The discovery, routing, identity, and lifecycle layer for micro-agents.

3. Policy and Trust Layer
   The layer that issues scoped authority and enforces approvals and constraints.

4. Company Micro-Agent Runtime
   The local execution environment where company-owned micro-agents run.

5. Resource Adapters
   The actual connectors to payments, databases, CRMs, files, and internal systems.

## Reference Architecture

```text
User
  |
  v
External Assistant (ChatGPT / Claude / Copilot / Enterprise Agent)
  |
  v
MAP Boundary
  |
  v
MAP Control Plane
  |---------- Registry
  |---------- Policy Engine
  |---------- Delegation Service
  |---------- Audit/Receipts
  |
  +--------------------+--------------------+-------------------+
  |                    |                    |                   |
  v                    v                    v                   v
PayPal PaymentAgent  DBReadAgent         CRMUpdateAgent     FileAgent
  |                    |                    |                   |
  v                    v                    v                   v
Payment Rail        Database            CRM System         Local/Cloud Files
```

## Why MAP Is Different

### Versus MCP

MCP makes tools easy to expose. MAP makes safe execution easy to deploy.

MCP gives the assistant access to tools. MAP gives the assistant access to company-controlled micro-agents that sit in front of tools.

### Versus A2A

A2A is about communication between larger agents. MAP is about external assistants delegating to many small, organization-owned execution agents.

### Versus Traditional APIs

APIs expose endpoints. MAP exposes policy-aware execution units that can validate, redact, approve, deny, summarize, and audit.

## SDKs

MAP Protocol provides official SDKs for multiple languages:

### TypeScript/JavaScript SDK

The TypeScript SDK is not published to npm yet. Use it from this repository for now:

```bash
git clone https://github.com/BHAWESHBHASKAR/micro-agent-protocol.git
cd micro-agent-protocol/packages/typescript
npm install
npm run build
```

```typescript
import { MapAssistantClient } from './src';

const client = MapAssistantClient.forBaseUrl('https://api.mapprotocol.ai');
client.configureSigning('key-id', 'secret');

const result = await client.dispatch({
  capability: 'payment.process',
  envelope: { ... },
});
```

The TypeScript SDK is the canonical SDK surface currently aligned with the reference HTTP server.

### Python SDK

The Python SDK is not published to PyPI yet. Use a local editable install from this repository:

```bash
git clone https://github.com/BHAWESHBHASKAR/micro-agent-protocol.git
cd micro-agent-protocol/packages/python
pip install -e .
```

```python
from mapprotocol import Client

client = Client(base_url="https://api.mapprotocol.ai")
client.configure_signing(key_id="key-id", secret="secret")
result = client.dispatch({ ... })
```

The Python SDK is currently a preview surface and is not yet fully aligned with the reference HTTP contract.

### Go SDK

The Go SDK is not published as a released module yet. Use it from a local checkout for now:

```bash
git clone https://github.com/BHAWESHBHASKAR/micro-agent-protocol.git
cd micro-agent-protocol/packages/go
go test ./...
```

```go
client := mapproto.NewClient("https://api.mapprotocol.ai")
client.ConfigureSigning("key-id", "secret")
result, err := client.Dispatch(req)
```

The Go SDK is currently a preview surface and is not yet fully aligned with the reference HTTP contract.

## Repository Structure

### Packages

- [`packages/typescript`](./packages/typescript/): TypeScript/Node.js SDK
- [`packages/python`](./packages/python/): Python SDK
- [`packages/go`](./packages/go/): Go SDK

### Documentation

- [`docs/vision.md`](./docs/vision.md): problem framing, thesis, and product positioning
- [`docs/architecture.md`](./docs/architecture.md): reference architecture for assistant-to-micro-agent delegation
- [`docs/target-production-architecture.md`](./docs/target-production-architecture.md): best-practice production architecture blueprint with system diagram and staged implementation plan
- [`docs/protocol-spec.md`](./docs/protocol-spec.md): draft protocol primitives and lifecycle
- [`docs/protocol-spec-v1-draft.md`](./docs/protocol-spec-v1-draft.md): normative v1 draft (MUST/SHOULD/MAY), lifecycle, errors, authz, and conformance requirements
- [`docs/http-transport.md`](./docs/http-transport.md): current HTTP binding and error contract draft
- [`docs/signing-model.md`](./docs/signing-model.md): current signing direction for tokens and receipts
- [`docs/trust-rfc.md`](./docs/trust-rfc.md): production trust, key lifecycle, replay resistance, and verification model
- [`docs/deployment-profiles.md`](./docs/deployment-profiles.md): runtime security profile requirements (`open`, `verified`, `regulated`)
- [`docs/scale-architecture-rfc.md`](./docs/scale-architecture-rfc.md): large-scale control-plane/runtime architecture and SLO guidance
- [`docs/mcp-ecosystem-analysis.md`](./docs/mcp-ecosystem-analysis.md): MCP ecosystem lessons translated into MAP implementation priorities
- [`docs/mcp-to-map-migration.md`](./docs/mcp-to-map-migration.md): migration strategy from direct tool protocols to MAP boundaries
- [`docs/readiness-matrix.md`](./docs/readiness-matrix.md): v1 readiness scoring and prioritized gap closure plan
- [`docs/constraint-vocabulary.md`](./docs/constraint-vocabulary.md): shared MAP constraint model for interoperable task scoping
- [`docs/registry-discovery.md`](./docs/registry-discovery.md): registry semantics and capability/domain discovery model
- [`docs/registry-trust.md`](./docs/registry-trust.md): signed descriptor trust model for discovery
- [`docs/key-management.md`](./docs/key-management.md): current key-discovery and rotation draft
- [`docs/capability-schemas.md`](./docs/capability-schemas.md): per-capability request/response schema registration model
- [`docs/version-negotiation.md`](./docs/version-negotiation.md): protocol and capability version negotiation model
- [`docs/security-model.md`](./docs/security-model.md): trust boundaries, threat model, and security principles
- [`docs/assistant-sdk.md`](./docs/assistant-sdk.md): assistant-facing SDK for discovery/dispatch/approval/status flows
- [`docs/build-alignment.md`](./docs/build-alignment.md): audit of how the current build matches the original MAP idea
- [`docs/roadmap.md`](./docs/roadmap.md): phased path from concept to reference implementation
- [`docs/demo.md`](./docs/demo.md): how to run the minimal MAP server and payment flow
- [`schemas/`](./schemas): canonical JSON Schema definitions for core MAP protocol objects
- [`examples/`](./examples): example descriptors, task envelopes, delegation tokens, result packages, and receipts
- [`reference/`](./reference): minimal TypeScript scaffold for a MAP control plane and micro-agent runtime
- [`conformance/`](./conformance): Protocol conformance test suite

### Planning Documents (PAD)

- [`docs/pad/PAD-01-Project-Overview.md`](./docs/pad/PAD-01-Project-Overview.md): Project overview and vision
- [`docs/pad/PAD-02-System-Architecture.md`](./docs/pad/PAD-02-System-Architecture.md): Complete architecture
- [`docs/pad/PAD-03-OpenAPI-Spec.md`](./docs/pad/PAD-03-OpenAPI-Spec.md): OpenAPI 3.1 specification
- [`docs/pad/PAD-04-Protocol-Specification.md`](./docs/pad/PAD-04-Protocol-Specification.md): Protocol specification
- [`docs/pad/PAD-05-TypeScript-Reference-Hardening.md`](./docs/pad/PAD-05-TypeScript-Reference-Hardening.md): SDK hardening
- [`docs/pad/PAD-06-Python-SDK-Design.md`](./docs/pad/PAD-06-Python-SDK-Design.md): Python SDK design
- [`docs/pad/PAD-07-Go-SDK-Design.md`](./docs/pad/PAD-07-Go-SDK-Design.md): Go SDK design
- [`docs/pad/PAD-08-TypeScript-SDK-Restructuring.md`](./docs/pad/PAD-08-TypeScript-SDK-Restructuring.md): TS SDK restructuring
- [`docs/pad/PAD-09-CICD-Pipeline-Design.md`](./docs/pad/PAD-09-CICD-Pipeline-Design.md): CI/CD pipeline design
- [`docs/pad/PAD-10-Conformance-Testing.md`](./docs/pad/PAD-10-Conformance-Testing.md): Conformance test suite
- [`docs/pad/PAD-11-Documentation-System.md`](./docs/pad/PAD-11-Documentation-System.md): Documentation system
- [`docs/pad/PAD-12-Legal.md`](./docs/pad/PAD-12-Legal.md): Apache 2.0 license and notices
- [`docs/pad/PAD-13-Governance.md`](./docs/pad/PAD-13-Governance.md): CoC and contributing
- [`docs/pad/PAD-14-Release-Plan.md`](./docs/pad/PAD-14-Release-Plan.md): Release plan

## Reference Verification

Run the full reference verification pipeline:

```bash
npm run verify:reference
```

Run the reference conformance harness:

```bash
npm run conformance:reference
```

Run deployment-profile conformance checks:

```bash
npm run conformance:profiles
```

Run trust-chain conformance checks:

```bash
npm run conformance:trust
```

Run deterministic-signature fixture conformance checks:

```bash
npm run conformance:fixtures
```

Run error-taxonomy conformance checks:

```bash
npm run conformance:errors
```

Run conformance-contract checks:

```bash
npm run conformance:contract
```

Run API surface conformance checks (pagination + ETag contracts):

```bash
npm run conformance:api-surface
```

Run all conformance suites:

```bash
npm run conformance:all
```

## Open Source Release

This repository currently contains the source implementation of MAP Protocol, including:

- **Multi-language SDKs**: TypeScript, Python, and Go
- **OpenAPI 3.1 Specification**: Full HTTP binding documentation
- **Conformance Test Suite**: Protocol validation tests
- **Documentation**: Docusaurus-based documentation system

### Quick Start

```bash
# Clone and test from source
git clone https://github.com/BHAWESHBHASKAR/micro-agent-protocol.git
cd micro-agent-protocol
npm install
cd packages/typescript && npm install && npm test
```

### License

MAP Protocol is licensed under Apache 2.0. See [LICENSE](./LICENSE) for details.

## Working Definition

Micro Agent Protocol is a framework and protocol standard that lets organizations deploy small, policy-controlled micro-agents between external AI assistants and sensitive systems, so execution stays local, authority stays bounded, and context stays minimal.
