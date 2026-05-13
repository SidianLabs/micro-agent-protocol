# MAP Capability Schema Registration Draft

## Overview

This document defines the next step beyond agent-level schemas: capability-level schema registration.

MAP agents often expose multiple capabilities. A single `input_schema_ref` and `output_schema_ref` at the agent level is useful, but it is not precise enough for strong interoperability. Clients need to know the exact request and response contract for each advertised capability.

## Why Capability-Level Schemas Matter

Without capability-level registration:

- a client knows an agent supports `payment.execute`, but not its exact contract
- agents with many capabilities look more uniform than they really are
- discovery is less actionable
- schema evolution becomes harder to manage

With capability-level registration:

- discovery can return the exact contract for each capability
- clients can validate before dispatch
- schema evolution can happen per capability
- documentation and tooling become clearer

## Capability Descriptor Shape

Each capability entry should describe:

- capability name
- execution mode
- request schema reference
- response schema reference
- optional constraint schema reference
- optional approval hint
- supported authentication schemes
- optional required authentication scheme
- schema version metadata
- optional provider translation targets
- optional status

Suggested shape:

```json
{
  "name": "payment.execute",
  "execution_mode": "commit",
  "request_schema_ref": "schema://payment.execute/request",
  "response_schema_ref": "schema://payment.execute/response",
  "constraint_schema_ref": "schema://payment.execute/constraints",
  "auth_schemes": ["signed_request"],
  "required_auth_scheme": "signed_request",
  "schema_version": "1.1.0",
  "supported_schema_versions": ["1.0.0", "1.1.0"],
  "preferred_schema_version": "1.1.0",
  "translation_targets": [
    {
      "from": "1.0.0",
      "to": "1.1.0",
      "mode": "provider_translation"
    }
  ],
  "compatibility": "backward_compatible",
  "approval_required_by_default": false,
  "status": "active"
}
```

## Agent Descriptor Integration

The agent descriptor should continue to advertise high-level agent metadata, but it should also include a `capability_descriptors` array for discovery-grade precision.

This lets a client:

1. discover an agent
2. inspect the supported capability list
3. choose a specific capability
4. load its exact request, response, and constraint schema

## Example: Payment Agent

```json
{
  "agent_id": "payment-agent-v1",
  "capability_descriptors": [
    {
      "name": "payment.execute",
      "execution_mode": "commit",
      "request_schema_ref": "schema://payment.execute/request",
      "response_schema_ref": "schema://payment.execute/response",
      "constraint_schema_ref": "schema://payment.execute/constraints",
      "auth_schemes": ["signed_request"],
      "required_auth_scheme": "signed_request",
      "approval_required_by_default": false,
      "status": "active"
    }
  ]
}
```

## Example: Database Read Agent

```json
{
  "agent_id": "dbread-agent-v1",
  "capability_descriptors": [
    {
      "name": "db.read.aggregate",
      "execution_mode": "analyze",
      "request_schema_ref": "schema://db.read.aggregate/request",
      "response_schema_ref": "schema://db.read.aggregate/response",
      "constraint_schema_ref": "schema://db.read.aggregate/constraints",
      "auth_schemes": ["bearer", "signed_request"],
      "approval_required_by_default": false,
      "status": "active"
    }
  ]
}
```

## Best-Practice Guidance

MAP providers should:

- version capability schemas independently
- keep capability contracts narrow
- avoid one generic schema for unrelated capabilities
- mark deprecated capabilities explicitly

## Future Direction

The formal MAP discovery model should support:

- per-capability schema resolution
- capability status and deprecation
- compatibility negotiation
- richer capability metadata such as idempotency, sync-versus-async hints, approval defaults, and auth negotiation preferences
