<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Invocation Negotiation Draft

## Overview

This document defines the first invocation-negotiation model for MAP.

MAP needs negotiation at two levels:

- protocol version
- capability contract version
- invocation-time execution preferences

Protocol version tells a client whether it speaks the same overall MAP dialect.

Capability contract version tells a client whether it can safely invoke a specific capability with a specific schema shape.

## Why This Matters

Without invocation negotiation:

- clients may call a capability using the wrong schema version
- clients may assume the wrong delivery mode
- providers may accept unsupported output visibility requests implicitly
- providers cannot evolve request and response contracts safely
- discovery becomes brittle as capabilities change over time

With invocation negotiation:

- clients can select a compatible contract before dispatch
- clients can request sync or async handling explicitly
- providers can reject unsupported visibility/output requests early
- providers can deprecate old capability versions gradually
- compatibility policy becomes explicit

## Versioning Principles

MAP should follow these principles:

- protocol versioning should be coarse and stable
- capability schema versioning should be explicit and per capability
- backward-compatible changes should not require a new major capability name
- incompatible changes should be discoverable before invocation

## Capability Descriptor Version Fields

Each capability descriptor should expose:

- `schema_version`
- `supported_schema_versions`
- `preferred_schema_version`
- `compatibility`

Suggested shape:

```json
{
  "name": "payment.execute",
  "schema_version": "1.1.0",
  "supported_schema_versions": ["1.0.0", "1.1.0"],
  "preferred_schema_version": "1.1.0",
  "compatibility": "backward_compatible"
}
```

## Compatibility Values

Suggested compatibility values:

- `backward_compatible`
- `forward_compatible`
- `breaking_change`

These values are advisory discovery metadata that help clients reason about how safely they can interoperate.

## Client Behavior

Best-practice client behavior:

1. discover candidate agents
2. inspect `capability_descriptors`
3. choose a capability whose `supported_schema_versions` intersects the client-supported versions
4. prefer `preferred_schema_version` when possible
5. avoid or warn on `breaking_change`

At dispatch time, the client may send `requested_schema_version` or the structured `negotiation.schema_version` field alongside the capability invocation.

## Provider Behavior

Best-practice provider behavior:

- keep at least one prior compatible version during migration
- mark deprecated versions or capabilities explicitly
- update `preferred_schema_version` when the newest stable contract becomes the recommended default
- reject unsupported request-time versions with a structured compatibility error

## Request-Time Negotiation

MAP now supports a request-time negotiation object:

```json
{
  "capability": "payment.execute",
  "negotiation": {
    "schema_version": "1.0.0",
    "delivery_mode": "async"
  },
  "envelope": {
    "task_id": "task_123",
    "requested_output_mode": "summary"
  }
}
```

Provider behavior should be:

1. resolve the target capability descriptor
2. if both `requested_schema_version` and `negotiation.schema_version` are present, they must agree
3. if no schema version is requested, use the capability's preferred version
4. if the requested schema version is supported, accept it
5. if it is unsupported, reject the request with `schema_version_unsupported`
6. if `negotiation.delivery_mode` is `async`, accept the task for asynchronous handling
7. if the requested output mode is not supported by the target agent descriptor, reject with `unsupported_output_mode`

## Provider Translation

MAP providers may also advertise explicit translation rules through capability metadata.

Suggested capability shape:

```json
{
  "name": "payment.execute",
  "preferred_schema_version": "1.1.0",
  "translation_targets": [
    {
      "from": "1.0.0",
      "to": "1.1.0",
      "mode": "provider_translation"
    }
  ]
}
```

This means:

- the client requested `1.0.0`
- the provider accepted that request
- execution actually ran against `1.1.0`

When provider translation occurs, MAP should record:

- `requested_schema_version`
- `executed_schema_version`
- `negotiation.requested`
- `negotiation.selected`

in both the result package and the execution receipt.

Suggested result shape:

```json
{
  "task_id": "task_123",
  "status": "completed",
  "requested_schema_version": "1.0.0",
  "executed_schema_version": "1.1.0",
  "negotiation": {
    "requested": {
      "schema_version": "1.0.0",
      "output_mode": "summary",
      "delivery_mode": "sync"
    },
    "selected": {
      "schema_version": "1.1.0",
      "output_mode": "summary",
      "delivery_mode": "sync"
    },
    "provider_actions": ["schema_translated"]
  }
}
```

## Future Direction

The formal MAP protocol should later define:

- server-side rejection semantics for unsupported versions
- capability-level visibility and evidence negotiation
- callback and webhook negotiation
- compatibility guarantees by version bump type
- optional provider-driven version translation rules
