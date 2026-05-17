<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Extension Policy (v1-rc)

## Purpose

Allow ecosystem extensions without breaking interoperability.

## Rules

1. Extensions MUST be additive and optional.
2. Core required fields MUST keep semantics across minor versions.
3. Unknown extension fields MUST be ignored safely by compliant consumers.
4. Extension namespaces SHOULD be prefixed (for example `x_vendor_*`).
5. Extension behavior MUST NOT change core lifecycle/security invariants.

## Compatibility

1. Removing an extension field is a breaking change for extension consumers.
2. Removing or changing core field semantics is a major protocol change.
