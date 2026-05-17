<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-17

### Added
- Async task queue with exponential backoff, jitter, and dead-letter handling
- Orchestrator with approval bypass, request_id propagation, strict tenant mode
- Policy engine with conformance test suites (reference, profiles, trust, errors, contract, API surface)
- HTTP, Payment, and DB-read adapters
- Full HTTP server with dispatch/approve/reject routes, webhook outbox, SQLite persistence
- TypeScript SDK (@sidianlabs/map-client) with generated types + schemas
- Python SDK (mapprotocol) — pyproject.toml packaging, mypy/ruff/black compliant
- Go SDK (github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto)
- Signing model with JWS/JCS canonicalization and key rotation
- Deployment profiles: open, verified, regulated
- Dockerfile + docker-compose.yml for reference server
- CI/CD: Node/Python/Go tests, lint, coverage, security audit, Docker publish
- Release workflow: per-SDK tag support, canary publishes on main merge
- ESLint 9 flat config with typescript-eslint
- Quickstart demo (npm run quickstart)

### Changed
- Version: 2026.05.14 → 0.1.0 (semver-compliant)
- Error code mapping replaced 78-line nested ternary with lookup table
- Copyright: © 2026 Sidian Labs
- .gitignore: removed SECURITY.md, CONTRIBUTING.md, NOTICE from ignore list

### Fixed
- Async queue retry mechanism: pendingRetry tracking for capacity management
- No adapter for capability → proper invalid_request error code
- SSRF protection: blocked 0.0.0.0, IPv6, AWS metadata addresses
- crypto.randomBytes for retry jitter (was Math.random)
- Removed orphan code, dead imports, and unused randomFn option
- TypeScript: 238/238 tests, 21 regression tests
- Python SDK: 154 tests across 8 test files

### Security
- Prototype pollution protection in body parser
- Admin token hashing (SHA-256) with timing-safe comparison
- File permissions: 0700 for directories, 0600 for dead-letter store
- HMAC secret rotation support

## [1.0.0-rc1] - 2025-03-30

### Added
- Core protocol types (TaskEnvelope, DispatchRequest, etc.)
- JSON schemas for validation
- Reference implementation in TypeScript
- Conformance test suites (reference, profiles, trust, fixtures, errors, contract, api-surface)
- Deployment profiles (open, verified, regulated)
- Signed request authentication
- Delegation tokens
- Error code taxonomy
- Version negotiation model

### Security
- Trust chain verification
- Key discovery with trust metadata
- Signature verification for audit exports

[0.1.0]: https://github.com/SidianLabs/micro-agent-protocol/releases/tag/v0.1.0
[1.0.0-rc1]: https://github.com/SidianLabs/micro-agent-protocol/releases/tag/v1.0.0-rc1