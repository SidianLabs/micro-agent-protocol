<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP SDK Compatibility Matrix

This document tracks the feature parity across all MAP Protocol SDK implementations.

**Legend:**
- ✅ **Complete** — Fully implemented and tested
- ⚠️ **Partial** — Implemented but missing some features or tests
- ❌ **Missing** — Not yet implemented
- N/A — Not applicable for this SDK

**Last Updated:** 2026-05-14

---

## API Methods

| Method | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| `dispatch` | ✅ | ✅ | ✅ | Core task dispatch |
| `dispatchBatch` | ✅ | ❌ | ❌ | Batch dispatch (parallel/sequential) |
| `approve` | ✅ | ✅ | ✅ | Human approval workflow |
| `cancel` / `cancelTask` | ✅ | ✅ | ❌ | Cancel pending task |
| `getTask` | ✅ | ✅ | ✅ | Get task by ID |
| `listTasks` | ✅ | ✅ | ✅ | List with filters & pagination |
| `listAgents` | ✅ | ✅ | ✅ | List with domain/capability filters |
| `getAgent` | ❌ | ❌ | ✅ | Get agent by ID |
| `getHealth` | ✅ | ✅ | ✅ | Health check endpoint |
| `getStatus` | ✅ | ✅ | ❌ | Status endpoint |
| `getReceipt` | ❌ | ❌ | ✅ | Get receipt by ID |
| `streamTask` (SSE) | ✅ | ✅ | ❌ | SSE streaming for task events |
| `forBaseUrl` (static) | ✅ | ❌ | N/A | Factory method |
| `use` (middleware) | ✅ | ⚠️ | ❌ | Middleware stack registration |

---

## Signing & Authentication

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| JWS MAPSIG (compact serialization) | ✅ | ✅ | ✅ | `typ: "MAPSIG"` |
| HMAC-SHA256 (HS256) | ✅ | ✅ | ✅ | Symmetric signing |
| RSA-SHA256 (RS256) | ✅ | ✅ | ✅ | Asymmetric signing |
| `base64url` encoding (no padding) | ✅ | ✅ | ✅ | RFC 7515 compliant |
| `stableStringify` (sorted keys) | ✅ | ✅ | ⚠️ | Go uses struct field order |
| Payload ordering: body, key_id, method, path, timestamp | ✅ | ✅ | ✅ | Alphabetical / canonical |
| Nonce generation (UUID v4) | ✅ | ✅ | ✅ | `randomUUID()` |
| Body hashing (HMAC-SHA256) | ✅ | ✅ | ⚠️ | Go uses full signing, not separate hash |
| Legacy HMAC `Authorization` header | ✅ | ✅ | ❌ | Pre-MAPSIG format |
| Key ID parsing (`chainID:address`) | ❌ | ❌ | ✅ | Multi-tenant key format |
| `X-MAP-*` header conventions | ✅ | ✅ | ✅ | Request-level signing headers |

---

## Transport Features

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| SSE streaming (`text/event-stream`) | ✅ | ✅ | ❌ | Auto-reconnect on disconnect |
| Retry with exponential backoff | ✅ | ✅ | ❌ | Configurable attempts/delay |
| Retry jitter | ✅ | ✅ | ❌ | Randomized delay |
| Timeout configuration | ✅ | ✅ | ✅ | Per-client setting |
| Custom headers | ✅ | ✅ | ✅ | `HeaderFunc` in Go |
| Middleware pipeline | ✅ | ⚠️ | ❌ | Request/response/error hooks |
| Idempotency key support | ✅ | ❌ | ❌ | `x-map-idempotency-key` |
| Tenant isolation header | ✅ | ✅ | ✅ | Query param or header |
| Functional options pattern | ❌ | ❌ | ✅ | Go-idiomatic configuration |
| URL encoding (task IDs, query params) | ✅ | ✅ | ✅ | `encodeURIComponent` / `urllib.parse.quote` |
| Async/await support | ✅ | ✅ | ❌ | Native in TS/Python; Go uses context |
| HTTP/2 support | ⚠️ | ⚠️ | ⚠️ | Depends on runtime |

---

## Error Handling

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| `MapAPIError` with code/status/retryable | ✅ | ✅ | ✅ | Structured error type |
| `MapValidationError` | ✅ | ✅ | ❌ | Validation error details |
| `MapSigningError` | ✅ | ✅ | ❌ | Signing-specific errors |
| `MapTimeoutError` | ✅ | ✅ | ❌ | Timeout errors |
| `MapRetryableError` | ✅ | ✅ | ❌ | Retryable error wrapper |
| Complete error code taxonomy (24 codes) | ✅ | ✅ | ✅ | Matching across SDKs |
| `ERROR_CODE_STATUS_MAP` | ✅ | ✅ | ✅ | Code to HTTP status mapping |
| `ERROR_CODE_RETRYABLE_MAP` | ✅ | ✅ | ✅ | Retry decision mapping |
| `ErrorDetails` with category/field/context | ✅ | ❌ | ❌ | Extended error info |
| `ValidationErrorDetail` | ✅ | ❌ | ❌ | Per-field validation |

---

## Types & Schemas

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| `DispatchRequest` | ✅ | ✅ | ✅ | Core request types |
| `ApprovalRequest` | ✅ | ✅ | ✅ | Approval types |
| `ResultPackage` | ✅ | ✅ | ✅ | Result types |
| `ExecutionReceipt` | ✅ | ✅ | ✅ | Receipt types |
| `TaskEnvelope` | ✅ | ✅ | ✅ | Envelope types |
| `TaskRecord` | ✅ | ✅ | ✅ | Full task record |
| `AgentDescriptor` | ✅ | ✅ | ✅ | Agent descriptor |
| `CapabilityDescriptor` | ✅ | ✅ | ⚠️ | Capability descriptor |
| `DelegationToken` | ✅ | ✅ | ⚠️ | Trust/delegation types |
| `RequesterIdentity` | ✅ | ✅ | ✅ | Identity types |
| `InvokeResult` | ✅ | ✅ | ✅ | Invocation result |
| `HealthStatus` | ✅ | ✅ | ✅ | Health check types |
| `VersionInfo` | ✅ | ✅ | ❌ | Version info types |
| Enum types (RiskLevel, TaskStatus, etc.) | ✅ | ✅ | ✅ | String enums |
| Generated types from schemas | ✅ | ❌ | ❌ | Auto-generated from JSON Schema |

---

## Storage & Persistence

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| In-memory task store | ⚠️ | ✅ | ❌ | InMemoryStorage |
| File-based task store | ❌ | ✅ | ❌ | FileStorage |
| SQLite task store | ❌ | ✅ | ❌ | SQLiteStorage |
| Receipt store adapter | ❌ | ✅ | ❌ | FileReceiptStoreAdapter |
| Task store adapter | ❌ | ✅ | ❌ | FileTaskStoreAdapter |

---

## Policy Engine

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| Policy evaluation | ⚠️ | ✅ | ❌ | PolicyEngine |
| Risk-based policies | ❌ | ✅ | ❌ | create_risk_based_policy |
| Task constraint evaluation | ❌ | ✅ | ❌ | evaluate_task_constraints |
| Policy rules & conditions | ⚠️ | ✅ | ❌ | PolicyRule, PolicyCondition |
| Policy effects (allow/deny/require_approval) | ⚠️ | ✅ | ❌ | PolicyEffect |

---

## Observability

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| Structured logging | ⚠️ | ✅ | ❌ | MAPLogger, LogLevel |
| Metrics collection | ❌ | ✅ | ❌ | MetricsCollector |
| Tracing | ❌ | ✅ | ❌ | Tracer |
| Latency tracking | ❌ | ✅ | ❌ | latency_tracker |
| Webhook events | ❌ | ✅ | ❌ | WebhookSender, WebhookEvent |

---

## Validation

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| Task envelope validation | ✅ | ✅ | ❌ | validate_task_envelope |
| Dispatch request validation | ✅ | ✅ | ❌ | validate_dispatch_request |
| Approval request validation | ✅ | ✅ | ❌ | validate_approval_request |
| Agent descriptor validation | ✅ | ✅ | ❌ | validate_agent_descriptor |
| Execution receipt validation | ✅ | ✅ | ❌ | validate_execution_receipt |
| Result package validation | ✅ | ✅ | ❌ | validate_result_package |

---

## Testing & Conformance

| Feature | TypeScript SDK | Python SDK | Go SDK | Notes |
|---|---|---|---|---|
| Unit tests | ✅ | ✅ | ✅ | Per-SDK test suites |
| Cross-SDK signature verification | ✅ | ✅ | ❌ | Verifies TS ↔ Python compatibility |
| Conformance test suite | ✅ | ❌ | ❌ | In `/conformance` directory |
| Integration tests | ✅ | ❌ | ❌ | Against reference server |
| Test fixtures | ✅ | ❌ | ❌ | JSON fixtures for test data |

---

## Summary

| SDK | API Coverage | Signing | Transport | Errors | Types | Extras |
|---|---|---|---|---|---|---|
| **TypeScript** | 13/15 (87%) | Full | Full | Full | Full | Middleware, batch, SSE |
| **Python** | 12/15 (80%) | Full | Full | Full | Full | Storage, policy, obs. |
| **Go** | 9/15 (60%) | Full | Basic | Basic | Most | Key ID parsing |

### Cross-SDK Compatibility Status

- **TS ↔ Python:** Signatures verified compatible (same algorithm, same format, same key ordering)
- **TS ↔ Go:** Structurally compatible (Go uses struct field ordering matching alphabetical)
- **Python ↔ Go:** Structurally compatible (both follow alphabetical/key ordering)

### Priority Gaps

1. **Go SDK:** `cancelTask`, `streamTask`, `dispatchBatch`, middleware, retry
2. **Python SDK:** `dispatchBatch`, idempotency key, error details, generated types
3. **TypeScript SDK:** `getAgent`, `getReceipt`, storage adapters, policy engine
