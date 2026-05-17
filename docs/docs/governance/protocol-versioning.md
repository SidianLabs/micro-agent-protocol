<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol Versioning and Change Policy

## Target Line

- Current target: `v1.0.0-rc1`
- Stability target: `v1.0.0`

## Policy

1. Breaking protocol changes require major version increment.
2. Additive compatible changes require minor increment.
3. Clarifications/docs-only updates require patch increment.
4. Conformance suite version MUST track protocol version.

## Release Promotion

1. `draft` -> `rc` requires passing full conformance suites.
2. `rc` -> `stable` requires at least two independent implementations passing conformance.

## Deprecation

1. Deprecated fields MUST have documented transition windows.
2. Runtime SHOULD emit compatibility warnings before hard removal.
