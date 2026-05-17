<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Registry and Discovery Draft

## Overview

This document defines the current draft for MAP registry and discovery semantics.

MAP needs a standard way for external assistants and assistant platforms to discover which micro-agents exist, what they can do, and how they should be invoked. Without that, MAP remains a point-to-point integration pattern rather than an interoperable ecosystem.

## Registry Purpose

The MAP registry is the source of truth for:

- micro-agent identity
- ownership
- version
- capabilities
- supported execution modes
- schema references
- transport bindings
- trust metadata

## Discovery Goals

Discovery should let an assistant-side client answer questions like:

- which micro-agent can execute `payment.execute`?
- which agents belong to a given provider?
- which agents support `read` mode?
- which agents operate in the `database` domain?
- where do I find the input and output schemas for a capability?

## Agent Descriptor Requirements

The descriptor should contain both:

- execution contract fields
- discovery metadata

The current MAP descriptor now includes or is moving toward:

- `agent_id`
- `organization`
- `version`
- `domain`
- `capabilities`
- `risk_level`
- `input_schema_ref`
- `output_schema_ref`
- `supported_execution_modes`
- `visibility_modes`
- `description`
- `display_name`
- `provider_url`
- `documentation_url`
- `auth_schemes`
- `transport_bindings`
- `tags`
- `registry_status`
- `descriptor_signature`
- `descriptor_key_id`
- `descriptor_signature_alg`

## Discovery Operations

The first HTTP discovery surface should support:

### Provider Bootstrap Discovery

`GET /.well-known/map`

Returns a provider-level MAP discovery document that clients can use to bootstrap:

- provider identity
- trust domain and deployment profile
- verification key discovery location
- micro-agent discovery location
- currently exposed agent inventory

This route should be lightweight and cacheable. Clients should treat it as the first discovery touchpoint, then use `GET /agents` to retrieve the signed micro-agent descriptors.

### List Agents

`GET /agents`

Returns all currently registered agent descriptors.

### Filter by Capability

`GET /agents?capability=payment.execute`

Returns only the agents that advertise the requested capability.

### Filter by Domain

`GET /agents?domain=database`

Returns only the agents in the requested domain.

The protocol should later support combined filters and pagination.

Discovery payloads should also expose capability-level version metadata so clients can choose a compatible contract before invocation.

## Transport Binding Metadata

Each descriptor should be able to advertise transport binding information so clients know how to reach it.

Suggested shape:

```json
[
  {
    "kind": "http",
    "endpoint": "https://provider.example.com/map"
  }
]
```

This is especially important once MAP supports:

- provider-hosted deployments
- internal enterprise gateways
- hybrid discovery topologies

## Auth Scheme Metadata

Descriptors should also declare the auth schemes required by their transport bindings.

Examples:

- `none`
- `bearer`
- `mtls`
- `signed_request`

Capability descriptors should be treated as the more precise source of truth when both are present.

This allows discovery payloads to express policies such as:

- `db.read.query` supports `none`, `bearer`, or `signed_request`
- `payment.execute` supports only `signed_request`
- `payment.refund` supports `signed_request` and requires it

## Registry Status

Descriptors should expose lifecycle status.

Suggested values:

- `active`
- `deprecated`
- `disabled`

This helps assistants avoid routing to stale or unsupported agents.

## Why This Matters

Without registry semantics:

- assistants cannot discover capabilities consistently
- providers cannot advertise supported versions cleanly
- transport and auth assumptions remain implicit

With registry semantics:

- provider-hosted MAP deployments become discoverable
- assistants can choose agents more safely
- interoperability becomes more realistic

## Descriptor Trust

Discovery clients should treat descriptor signatures as part of the trust boundary.

Signed descriptors let a client verify that:

- the provider really advertises the listed capabilities
- capability-level auth requirements were not downgraded
- schema version and translation metadata were not altered

See [`docs/registry-trust.md`](./registry-trust.md) for the current draft trust model.

## Next Steps

The next iteration should formalize:

- descriptor JSON Schema extensions
- discovery query semantics
- pagination
- sorting and ranking guidance
- provider key distribution and trust anchors
