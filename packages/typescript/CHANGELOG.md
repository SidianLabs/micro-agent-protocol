# Changelog - TypeScript SDK

All notable changes to the TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-05-03

### Added
- `MapAssistantClient` - Main client for MAP protocol interactions
- `AsyncMapAssistantClient` - Async version of the client
- `HMACSigner` - HMAC-SHA256 request signing
- `RSASigner` - RSA request signing
- `MapError`, `MapAPIError`, `MapTimeoutError`, `MapRetryableError`, `MapSigningError`, `MapValidationError` - Error classes
- `ErrorCode` enum with 24 error codes
- `ERROR_CODE_STATUS_MAP` and `ERROR_CODE_RETRYABLE_MAP` - Error code metadata
- `PolicyEngine` - Policy evaluation support
- `MAPLogger` - Structured logging
- Storage adapters: `InMemoryStorage`, `FileStorage`, `SQLiteStorage`
- `validateTaskEnvelope`, `validateDispatchRequest`, `validateApprovalRequest`, `validateResultPackage`, `validateExecutionReceipt`, `validateDelegationToken` - Schema validators
- JSON schema generated from protocol schemas

### Changed
- Updated to preview status (0.x versions)
- Protocol types synchronized from root protocol

### Fixed
- Schema validation for task envelopes and delegation tokens

### Known Issues
- WebSocket transport not yet implemented
- Retry logic needs more testing
- Full protocol spec alignment in progress (~80%)

[0.1.0]: https://github.com/mapprotocol/map/releases/tag/sdk/typescript/v0.1.0