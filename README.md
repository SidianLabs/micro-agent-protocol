# Micro Agent Protocol (MAP) — by Sidian Labs © 2026

Micro Agent Protocol (MAP) is a framework and protocol standard for deploying small, company-owned micro-agents between external AI assistants and sensitive systems.

**Primary Maintainer**: Bhawesh Bhaskar (bhawesh@sidian.dev)

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
git clone https://github.com/SidianLabs/micro-agent-protocol.git
cd micro-agent-protocol/packages/typescript
npm install
npm run build
```

```typescript
import { MapAssistantClient } from './src';

const client = MapAssistantClient.forBaseUrl('http://localhost:8787');
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
git clone https://github.com/SidianLabs/micro-agent-protocol.git
cd micro-agent-protocol/packages/python
pip install -e .
```

```python
from mapprotocol import Client

client = Client(base_url="http://localhost:8787")
client.configure_signing(key_id="key-id", secret="secret")
result = client.dispatch({ ... })
```

The Python SDK is currently a preview surface and is not yet fully aligned with the reference HTTP contract.

### Go SDK

The Go SDK is not published as a released module yet. Use it from a local checkout for now:

```bash
git clone https://github.com/SidianLabs/micro-agent-protocol.git
cd micro-agent-protocol/packages/go
go test ./...
```

```go
client := mapproto.NewClient("http://localhost:8787")
client.ConfigureSigning("key-id", "secret")
result, err := client.Dispatch(req)
```

The Go SDK is currently a preview surface and is not yet fully aligned with the reference HTTP contract.

## Repository Structure

### Packages

- [`packages/typescript`](./packages/typescript/): TypeScript/Node.js SDK
- [`packages/python`](./packages/python/): Python SDK
- [`packages/go`](./packages/go/): Go SDK
- [`schemas/`](./schemas): canonical JSON Schema definitions for core MAP protocol objects
- [`examples/`](./examples): example descriptors, task envelopes, delegation tokens, result packages, and receipts
- [`reference/`](./reference): minimal TypeScript scaffold for a MAP control plane and micro-agent runtime
- [`conformance/`](./conformance): Protocol conformance test suite

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

## Security Notice

⚠️ **This is alpha software. Do not use in production without proper security hardening.**

- The reference server uses plain HTTP. In production, always deploy behind a TLS-terminating reverse proxy (nginx, Caddy, etc.) or enable HTTPS directly.
- For mTLS authentication between assistants and MAP micro-agents, configure your reverse proxy to require client certificates.
- Never use the default demo signing key (`map-dev-key-1`) in production. Always set `MAP_SIGNING_SECRET` or configure a proper key provider.
- Admin endpoints should be restricted to internal networks only.
- See [SECURITY.md](./SECURITY.md) for the full security policy.
- To enable HTTPS directly on the reference server, set `port: 443` and provide `certPath` and `keyPath` in the server options.

### Quick Start

```bash
git clone https://github.com/SidianLabs/micro-agent-protocol.git
cd micro-agent-protocol
npm install
cd packages/typescript && npm install && npm test
```

### License

MAP Protocol is licensed under Apache 2.0. See [LICENSE](./LICENSE) for details.

## Working Definition

Micro Agent Protocol is a framework and protocol standard that lets organizations deploy small, policy-controlled micro-agents between external AI assistants and sensitive systems, so execution stays local, authority stays bounded, and context stays minimal.

---

© 2026 Sidian Labs.
