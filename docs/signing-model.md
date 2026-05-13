# MAP Signing Model Draft

## Overview

This document defines the current signing direction for MAP delegation tokens and execution receipts.

The protocol needs tamper-evident authority objects and audit objects. Without that, MAP cannot credibly claim that authority is bounded or that execution outcomes are trustworthy.

## Goals

The signing model should provide:

- tamper-evident delegation tokens
- tamper-evident execution receipts
- stable payload canonicalization
- room for key rotation
- a path toward a formal JWS-based spec

## Current Reference Implementation

The reference code now signs:

- delegation tokens in [`delegation.ts`](../reference/src/control-plane/delegation.ts)
- execution receipts in [`micro-agent.ts`](../reference/src/runtime/micro-agent.ts)
- approval-required receipts in [`orchestrator.ts`](../reference/src/control-plane/orchestrator.ts)

The signing helpers live in [`signing.ts`](../reference/src/security/signing.ts).

The current implementation uses:

- HMAC-SHA256
- a compact three-part signature string
- deterministic payload serialization
- a development key id and secret

This is a pragmatic reference step, not the final interoperable standard.

## Signature Shape

The reference implementation uses a compact string:

`base64url(header).base64url(payload).base64url(signature)`

The header currently includes:

- `alg`
- `kid`
- `typ`

The payload is a canonicalized subset of the token or receipt body.

## Delegation Token Coverage

The token signature covers:

- issuer
- subject agent
- allowed actions
- resource scope
- constraints
- approval reference
- requester identity

That means a consumer can detect changes to delegated authority or constraints.

## Receipt Coverage

The receipt signature covers:

- receipt id
- task id
- agent id
- action taken
- resource touched
- policy checks
- approval used
- timestamp
- result hash

That means receipts can act as durable, tamper-evident audit artifacts.

## Verification

The current reference runtime verifies token signatures before micro-agent execution.

That verification happens in [`micro-agent.ts`](../reference/src/runtime/micro-agent.ts).

## Future Direction

The formal MAP protocol should likely standardize on a JWS-compatible model so different teams can interoperate with existing libraries and key infrastructure.

The likely next step is:

- formalize canonical claims
- define signing headers
- define key discovery and rotation
- define receipt verification rules
- migrate from the current reference HMAC approach toward a JWS-aligned wire format

The current draft for key discovery and rotation is documented in [`docs/key-management.md`](./key-management.md).

## Positioning

The important point is not that the current implementation is final.

The important point is that MAP now treats signatures as a protocol concern, not a placeholder string.
