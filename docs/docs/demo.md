<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Demo

## Overview

The repository now includes a minimal runnable MAP demo:

- a tiny HTTP server
- runtime schema validation
- an end-to-end payment dispatch flow
- a second data-access example through `DBReadAgent`

This is intentionally narrow. The goal is to make the protocol real without prematurely expanding the runtime surface.

## Commands

Install dependencies:

```bash
npm install
```

Start the demo server:

```bash
npm run dev:server
```

In another terminal, dispatch the sample payment task:

```bash
npm run demo:payment
```

Or dispatch the sample database read task:

```bash
npm run demo:db-read
```

Run the reference conformance harness:

```bash
npm run conformance:reference
```

## Routes

### `GET /health`

Returns a basic server health response.

### `GET /ready`

Returns readiness state for configured writable stores (task, dead-letter, metrics). Suitable for deployment readiness probes.

### `GET /status`

Returns a safe runtime/config snapshot for operations visibility and config drift checks.

### `GET /agents`

Returns the registered MAP micro-agents.

### `GET /metrics`

Returns runtime metrics including queue/dead-letter state, task counts, request error rates, error counters (including per-agent), capability latencies, and configured alert thresholds with breach flags.

### `GET /alerts`

Returns normalized active alerts with lifecycle timestamps (`first_seen`, `last_seen`) and optional tenant filtering.

### `POST /alerts/:alert_id/ack`

Acknowledges an alert for operator workflow tracking.

### `POST /alerts/:alert_id/suppress`

Suppresses an alert temporarily by duration or until timestamp.

### `GET /admin/runtime-controls`

Returns effective runtime control state (`disabled_agents`, `disabled_capabilities`, `revoked_keys`) for operator visibility.

### `GET /audit-events`

Returns persisted security audit events (`auth_required`, `invalid_auth`, `rate_limited`, `policy_denied`) with optional tenant filtering.

### `POST /dispatch`

Accepts:

```json
{
  "capability": "payment.execute",
  "envelope": {
    "...": "MAP task envelope"
  }
}
```

The server validates the request, evaluates policy, issues a delegation token, invokes the target micro-agent, validates the result and receipt, and returns the final payload.

## Current Behavior

The demo includes:

- `PaymentAgent`
- `DBReadAgent`
- one simple policy engine

Policy behavior in the current scaffold:

- payments require `approved_vendor_only = true`
- payments over the hard-coded threshold are flagged as approval-required by the policy layer
- database reads can be constrained by environment and output mode

The current implementation is intentionally simplified and still executes the sample flow. The next iteration should make `require_approval` a first-class response state instead of a soft policy signal.

## Optional Runtime Hardening Config

The demo server supports these environment variables for state and SLO guardrails:

- `MAP_TASK_STORE_PATH`
- `MAP_TASK_DB_PATH` (SQLite task store path; takes precedence over JSON task store)
- `MAP_RECEIPT_STORE_PATH`
- `MAP_RECEIPT_DB_PATH` (SQLite receipt store path; takes precedence over JSON receipt store)
- `MAP_DEAD_LETTER_STORE_PATH`
- `MAP_REQUIRE_TENANT=true|false`
- `MAP_DEPLOYMENT_PROFILE=open|verified|regulated`
- `MAP_ASYNC_MAX_ATTEMPTS`
- `MAP_ASYNC_RETRY_DELAY_MS`
- `MAP_ASYNC_MAX_RETRY_DELAY_MS`
- `MAP_ASYNC_RETRY_JITTER_RATIO` (`0..1`, where `0` disables jitter)
- `MAP_ASYNC_MAX_CONCURRENT`
- `MAP_ASYNC_MAX_CONCURRENT_PER_TENANT`
- `MAP_ASYNC_MAX_QUEUE_DEPTH`
- `MAP_ASYNC_MAX_DEAD_LETTERS`
- `MAP_HEALTH_MAX_DEAD_LETTERS`
- `MAP_HEALTH_MAX_OLDEST_DL_AGE_MS`
- `MAP_METRICS_FAILURE_RATE_THRESHOLD`
- `MAP_METRICS_STORE_PATH`
- `MAP_RATE_LIMIT_WINDOW_MS`
- `MAP_RATE_LIMIT_MAX_REQUESTS`
- `MAP_RATE_LIMIT_MAX_REQUESTS_PER_TENANT`
- `MAP_AUDIT_STORE_PATH`
- `MAP_AUDIT_MAX_EVENTS`
- `MAP_AUDIT_CHECKPOINT_INTERVAL`
- `MAP_ALERT_STORE_PATH`
- `MAP_RUNTIME_CONTROL_STORE_PATH`
- `MAP_ADMIN_TOKEN` (required for `/admin/*` runtime controls)
- `MAP_SIGNING_KEYS` (JSON keyring for rotation)
- `MAP_SIGNING_ACTIVE_KID`
- `MAP_SIGNING_REVOKED_KIDS` (comma-separated key IDs to force-revoke)
- `MAP_KEY_DISCOVERY_EXPOSE_PEM=true|false`
- `MAP_KEY_DISCOVERY_CACHE_MAX_AGE_SEC`
- `MAP_SIGNING_RETIRING_KEY_CRITICAL_RATIO`
- `MAP_SIGNING_UNKNOWN_KEY_CRITICAL_RATIO`
