<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Changelog - Python SDK

All notable changes to the Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-05-03

### Added
- `Client` - Main synchronous client for MAP protocol interactions
- `AsyncClient` - Async version of the client
- `HMACSigner` - HMAC-SHA256 request signing
- `MapError`, `MapAPIError`, `MapTimeoutError`, `MapRetryableError`, `MapSigningError`, `MapValidationError` - Error classes
- `ERROR_CODE_STATUS_MAP` and `ERROR_CODE_RETRYABLE_MAP` - Error code metadata

### Changed
- Updated to preview status (0.x versions)

### Known Issues
- Not fully aligned with TypeScript SDK API surface
- Async support incomplete
- Error code mapping not complete
- No storage adapter implementations

[0.1.0]: https://github.com/SidianLabs/micro-agent-protocol/releases/tag/sdk/python/v0.1.0