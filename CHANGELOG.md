# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial preview release of TypeScript SDK
- Initial preview release of Python SDK
- Initial preview release of Go SDK

### Changed
- Protocol types aligned across all SDKs
- Error codes with retryable status maps

### Fixed
- Various conformance test fixes
- Schema validation issues

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

[Unreleased]: https://github.com/SidianLabs/micro-agent-protocol/compare/v1.0.0-rc1...HEAD
[1.0.0-rc1]: https://github.com/SidianLabs/micro-agent-protocol/releases/tag/v1.0.0-rc1