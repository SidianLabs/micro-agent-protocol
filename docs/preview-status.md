# MAP Protocol Preview Status

**Last Updated:** 2025-05-03

## Overview

All MAP Protocol SDKs are currently in **preview** status. The core protocol is stable (v1.0.0-rc1), but SDKs are still catching up to full specification alignment.

## SDK Status

| SDK | Version | Status | Spec Alignment |
|-----|---------|--------|----------------|
| TypeScript | 0.1.0 | Preview | ~80% |
| Python | 0.1.0 | Preview | ~60% |
| Go | 0.1.0 | Preview | ~50% |

## What This Means

### Preview Package Users

- **Expect breaking changes** in minor versions (0.x)
- **Monitor CHANGELOG** before updating
- **Pin versions** in production if stability is critical
- **Report issues** at https://github.com/mapprotocol/map/issues

### SDK Roadmap to 1.0.0

#### TypeScript SDK (0.1.0 → 1.0.0)
- [ ] Full protocol spec alignment
- [ ] WebSocket transport
- [ ] Complete retry/backoff logic
- [ ] Full storage adapter interface
- [ ] End-to-end integration tests

#### Python SDK (0.1.0 → 1.0.0)
- [ ] Align with TypeScript SDK API surface
- [ ] Add async/await support throughout
- [ ] Complete error code mapping
- [ ] Add storage adapter implementations
- [ ] Integration test suite

#### Go SDK (0.1.0 → 1.0.0)
- [ ] Complete protocol types
- [ ] Full error handling alignment
- [ ] Add retry middleware
- [ ] Complete signing implementations
- [ ] Integration test suite

## Versioning Policy

- **0.x**: Preview releases, breaking changes allowed
- **1.x**: Stable releases, backward compatibility required
- SDK versions are independent from protocol version

## Release Tags

SDK releases use semantic version tags:
- `sdk/typescript/v0.2.0`
- `sdk/python/v0.2.0`
- `sdk/go/v0.2.0`

## Migration Guide

When upgrading preview SDKs, check:
1. CHANGELOG.md in the SDK package
2. Protocol changes in root CHANGELOG.md
3. Any breaking changes noted in release notes