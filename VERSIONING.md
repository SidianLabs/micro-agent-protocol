<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Versioning

## Version Mapping

| Signal | Value | Meaning |
|--------|-------|---------|
| MAP Protocol Spec | v1.0 Draft | The wire protocol and receipt contract defined in `spec/MAP-SPEC-v1.md` |
| TypeScript Reference Implementation | v0.1.x | Developer preview — breaking changes possible |
| Stability Tier | Pre-1.0 | API surface may change between minor versions |

## What does v0.1.0 of the package give me?

- A working implementation of the MAP v1.0 Draft protocol spec.
- All core contracts (Intent → Policy → Execution → Receipt) are functional.
- The API surface is not yet frozen — breaking changes may occur in 0.x releases.
- Suitable for development, prototyping, and integration testing.
- Not recommended for production workloads without pinning to an exact version.

## Runtime Constants

The reference implementation exports two constants for programmatic introspection:

```typescript
import { MAP_PROTOCOL_VERSION, MAP_REFERENCE_VERSION } from '@sidianlabs/map';

console.log(MAP_PROTOCOL_VERSION);   // "1.0"
console.log(MAP_REFERENCE_VERSION);  // "0.1.0" (from package.json)
```

## Stability Guarantees

- **Pre-1.0**: No backward compatibility guarantees between minor versions.
- **Post-1.0** (future): Semantic versioning with backward-compatible minor releases.
- The protocol spec version (`MAP_PROTOCOL_VERSION`) tracks the wire format.
- The implementation version (`MAP_REFERENCE_VERSION`) tracks the package release.

## Spec Versioning

The protocol specification uses a `v{major}.{minor}` scheme:
- `spec/MAP-SPEC-v1.md` — current draft (v1.0 Draft)
- Future breaking changes to the wire protocol will increment the major version.
