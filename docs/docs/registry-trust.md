<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Registry Trust Model

## Overview

MAP discovery only becomes trustworthy when a client can verify that a descriptor really came from the provider that owns the micro-agent.

This document defines the current draft trust model for registry and discovery payloads.

## Why Descriptor Signing Matters

Without descriptor signing:

- a client may trust a forged capability list
- auth requirements could be downgraded in transit
- schema translation rules could be tampered with
- a malicious registry or proxy could misroute execution

With descriptor signing:

- the provider can attest to its descriptor contents
- the client can verify discovery metadata before dispatch
- auth and version policy become tamper-evident

## Signed Descriptor Fields

MAP agent descriptors may include:

- `descriptor_signature`
- `descriptor_key_id`
- `descriptor_signature_alg`

The signature is computed over the descriptor payload excluding those signature fields themselves.

## Verification Model

A client verifying a MAP descriptor should:

1. fetch the descriptor from discovery
2. resolve the provider key indicated by `descriptor_key_id`
3. verify `descriptor_signature`
4. trust auth, version, and transport metadata only after verification

The current draft key-discovery surface is documented in [`docs/key-management.md`](./key-management.md).

## Reference Implementation

The current reference registry:

- signs descriptors automatically when they are registered without a signature
- verifies pre-signed descriptors before accepting them
- exposes signed descriptors through `GET /agents`

This gives the demo a simple but real discovery trust boundary.

## Future Direction

The formal MAP trust model should later define:

- provider key distribution
- key rotation behavior
- detached signatures or JWS bindings
- signed registry index documents
