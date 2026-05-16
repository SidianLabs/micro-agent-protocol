<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Changelog - Go SDK

All notable changes to the Go SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-05-03

### Added
- `Client` - Main client for MAP protocol interactions
- `HMACSigner` - HMAC-SHA256 request signing
- `RSASigner` - RSA request signing
- `APIError` - Structured API error with code, message, retryable, status
- `MapError` - Error wrapper with code, message, and underlying error
- `MapValidationError` - Validation error with field-level details
- `MapRetryableError` - Retryable error with retry-after information
- `ErrorCode` enum with 24 error codes
- `ErrorCodeStatusMap` and `ErrorCodeRetryableMap` - Error code metadata
- `VersionInfo` - Protocol version information

### Changed
- Updated to preview status (0.x versions)
- Module path changed from `github.com/SidianLabs/micro-agent-protocol` to `github.com/SidianLabs/micro-agent-protocol/mapproto`

### Known Issues
- Protocol types not complete
- Error handling needs full alignment
- No retry middleware
- Signing implementations need completion
- No integration tests

[0.1.0]: https://github.com/SidianLabs/micro-agent-protocol/releases/tag/sdk/go/v0.1.0