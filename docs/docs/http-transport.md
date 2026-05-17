<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP HTTP Transport Draft

## Overview

This document defines the current HTTP binding draft for the MAP demo server.

It is intentionally small, but it establishes the shape of the wire contract between an assistant-side client and a MAP server.

## Base Model

The assistant side sends HTTP requests to a MAP endpoint that exposes:

- health and version information
- micro-agent discovery
- task dispatch
- task state retrieval

All request and response bodies are JSON.

Authentication is transport-binding specific. The current demo supports `signed_request` authentication for mutating routes and documents that model in [`docs/authentication-model.md`](./authentication-model.md).

## Routes

### `GET /health`

Returns server health and protocol version.

Example response:

```json
{
  "status": "ok",
  "protocol": "MAP",
  "version": "0.1.0",
  "checks": {
    "queue": {
      "queue_depth": 0,
      "dead_letter_count": 0
    }
  }
}
```

When thresholds are configured, `status` may be `degraded` and `checks.degraded_reasons` will include breach identifiers.

### `GET /ready`

Returns deployment readiness for key writable dependencies.

Example response:

```json
{
  "status": "ready",
  "protocol": "MAP",
  "version": "0.1.0",
  "checks": {
    "task_store": {
      "configured": true,
      "writable": true
    },
    "receipt_store": {
      "configured": true,
      "writable": true
    },
    "dead_letter_store": {
      "configured": true,
      "writable": true
    },
    "metrics_store": {
      "configured": true,
      "writable": true
    },
    "deployment_profile": {
      "profile": "verified",
      "compliant": true,
      "violations": []
    }
  }
}
```

If one or more configured stores are not writable, the route returns `503` with `status: "not_ready"`.

### Pagination

`GET /tasks`, `GET /receipts`, `GET /dead-letters`, and `GET /alerts` support:

- `limit` (default `100`, max `500`)
- `cursor` (opaque item id from `pagination.next_cursor`)
- `tenant_id` (optional partition filter)

Paginated responses include:

```json
{
  "pagination": {
    "limit": 100,
    "next_cursor": "task_abc"
  }
}
```

All four routes return `ETag` and honor `If-None-Match` with `304`.

### `GET /.well-known/map-keys`

Returns verification keys and trust metadata for MAP signature verification.

Response includes:

- `keys`
- `active_kid`
- `signing_profile`
- `trust.trust_domain`
- `trust.issuer`
- `trust.profile`
- `rotation_hints`
- `pagination`

Supports `limit`, `cursor`, `format=jwk`, `include_pem=false`, and conditional `ETag`/`If-None-Match`.

### `GET /.well-known/map`

Returns the MAP provider bootstrap discovery document.

Response includes:

- `protocol`
- `provider`
- `trust`
- `transports`
- `agents`
- `documentation`

This route is intended for first-contact discovery. It is provider-oriented rather than task-oriented and should be treated as the bootstrap entrypoint before retrieving signed agent descriptors from `GET /agents`.

### `GET /status`

Returns a non-secret runtime status snapshot to help detect deployment config drift.

Example response:

```json
{
  "status": "ok",
  "protocol": "MAP",
  "version": "0.1.0",
  "runtime": {
    "node_version": "v22.0.0",
    "uptime_s": 47
  },
  "config": {
    "deployment_profile": "open",
    "enforce_signed_requests": false,
    "require_tenant": false,
    "async_queue": {
      "max_attempts": 3,
      "retry_delay_ms": 50,
      "max_retry_delay_ms": 5000,
      "retry_jitter_ratio": 0.2,
      "max_concurrent": 4,
      "max_concurrent_per_tenant": null,
      "max_queue_depth": 1000,
      "max_dead_letters": 500
    },
    "health_thresholds": {
      "dead_letter_count": null,
      "oldest_dead_letter_age_ms": null
    },
    "metrics": {
      "window_ms": 300000,
      "max_latency_samples_per_capability": 200,
      "failure_rate_threshold": null
    },
    "rate_limits": {
      "window_ms": 60000,
      "max_requests_global": null,
      "max_requests_per_tenant": null
    },
    "audit": {
      "store_configured": true,
      "max_events": 5000
    },
    "signing": {
      "thresholds": {
        "unknown_key_critical_ratio": 0,
        "retiring_key_critical_ratio": 0.2
      },
      "verification_keys": [
        {
          "kid": "map-dev-key-1",
          "alg": "HS256",
          "use": "sig",
          "status": "active",
          "scopes": ["descriptor", "delegation_token", "receipt", "http_request"],
          "demo_only": true
        }
      ],
      "key_usage": {
        "agent_descriptors_by_key_id": {
          "map-dev-key-1": 2
        },
        "receipts_by_key_id": {
          "map-dev-key-1": 14
        },
        "audit_checkpoints_by_key_id": {
          "map-dev-key-1": 3
        }
      },
      "anomalies": {
        "unknown_key_usage_detected": false,
        "retiring_key_usage_detected": false,
        "unknown_key_usage_ratio": 0,
        "retiring_key_usage_ratio": 0,
        "total_signatures_analyzed": 19,
        "thresholds": {
          "unknown_key_critical_ratio": 0,
          "retiring_key_critical_ratio": 0.2
        },
        "threshold_breaches": {
          "unknown_key_ratio_exceeded": false,
          "retiring_key_ratio_exceeded": false
        },
        "severity": "ok",
        "recommended_action": "No action required."
      }
    },
    "stores": {
      "task_store_configured": true,
      "dead_letter_store_configured": true,
      "metrics_store_configured": true
    }
  }
}
```

### `GET /agents`

Returns the currently registered micro-agent descriptors.

Example response:

```json
{
  "agents": [
    {
      "agent_id": "payment-agent-v1",
      "organization": "example-corp"
    }
  ]
}
```

Discovery filters:

- `GET /agents?capability=payment.execute`
- `GET /agents?domain=database`

### `GET /tasks`

Returns persisted task records known to the MAP server.

### `GET /tasks/:task_id`

Returns the current known state for one task.

Example response:

```json
{
  "task": {
    "task_id": "task_db_state",
    "capability": "db.read.aggregate",
    "target_agent": "dbread-agent-v1",
    "status": "completed",
    "updated_at": "2026-03-19T18:00:00Z"
  }
}
```

### `GET /metrics`

Returns server metrics for queue, task state distribution, request success/failure, error counters, and capability latency.

Example response shape:

```json
{
  "metrics": {
    "queue": {
      "queue_depth": 0,
      "dead_letter_count": 0
    },
    "signing": {
      "key_usage": {
        "agent_descriptors_by_key_id": {
          "map-dev-key-1": 2
        },
        "receipts_by_key_id": {
          "map-dev-key-1": 14
        },
        "audit_checkpoints_by_key_id": {
          "map-dev-key-1": 3
        }
      },
      "anomalies": {
        "unknown_key_usage_detected": false,
        "retiring_key_usage_detected": false,
        "unknown_key_usage_ratio": 0,
        "retiring_key_usage_ratio": 0,
        "total_signatures_analyzed": 19,
        "thresholds": {
          "unknown_key_critical_ratio": 0,
          "retiring_key_critical_ratio": 0.2
        },
        "threshold_breaches": {
          "unknown_key_ratio_exceeded": false,
          "retiring_key_ratio_exceeded": false
        },
        "severity": "ok",
        "recommended_action": "No action required."
      }
    },
    "tasks": {
      "total": 4,
      "by_status": {
        "completed": 4
      },
      "by_capability": {
        "db.read.aggregate": 3
      },
      "by_agent": {
        "dbread-agent-v1": 3
      }
    },
    "requests": {
      "total": 12,
      "window_ms": 300000,
      "failure_rate_window": 0.08
    },
    "errors": {
      "by_code": {},
      "by_agent": {},
      "by_agent_by_code": {}
    },
    "latencies": {
      "by_capability": {}
    },
    "alerts": {
      "thresholds": {
        "dead_letter_count": 10,
        "request_failure_rate_window": 0.05
      },
      "breaches": {
        "dead_letter_count_exceeded": false,
        "oldest_dead_letter_age_exceeded": false,
        "request_failure_rate_exceeded": true
      }
    }
  }
}
```

### `GET /alerts`

Returns normalized active alerts derived from runtime signals. Alerts include lifecycle timestamps.

Filters:

- `GET /alerts?tenant_id=tenant_A`
- `GET /alerts?limit=100`
- `GET /alerts?cursor=alert:requests:failure_rate_exceeded:global`
- `GET /alerts?tenant_id=tenant_A&limit=50&cursor=alert:requests:failure_rate_exceeded:tenant_A`

This route returns pagination metadata and supports `ETag` / `If-None-Match` (`304`).

Example response:

```json
{
  "alerts": [
    {
      "id": "alert:requests:failure_rate_exceeded:global",
      "source": "requests",
      "code": "request_failure_rate_exceeded",
      "severity": "warning",
      "message": "Request failure rate exceeded configured threshold.",
      "recommended_action": "Check recent errors and mitigate root causes before traffic impact grows.",
      "first_seen": "2026-03-22T10:00:00.000Z",
      "last_seen": "2026-03-22T10:02:00.000Z"
    }
  ],
  "pagination": {
    "limit": 100,
    "next_cursor": "alert:requests:failure_rate_exceeded:global"
  }
}
```

### `GET /dead-letters`

Returns asynchronous execution attempts that exhausted retry policy and were moved to the dead-letter queue.

Filters:

- `GET /dead-letters?tenant_id=tenant_A`
- `GET /dead-letters?limit=100`
- `GET /dead-letters?cursor=task_abc`
- `GET /dead-letters?tenant_id=tenant_A&limit=50&cursor=task_abc`

This route returns pagination metadata and supports `ETag` / `If-None-Match` (`304`).

Example response:

```json
{
  "dead_letters": [
    {
      "task_id": "task_abc",
      "tenant_id": "tenant_A",
      "attempts": 3,
      "error": "Async queue capacity exceeded."
    }
  ],
  "pagination": {
    "limit": 100,
    "next_cursor": "task_abc"
  }
}
```

### `POST /alerts/:alert_id/ack`

Acknowledges an active alert and records acknowledgement metadata.

Request body:

```json
{
  "actor": "ops_user_1"
}
```

### `POST /alerts/:alert_id/suppress`

Suppresses an active alert until a given timestamp or for a duration.

Request body (duration):

```json
{
  "actor": "ops_user_2",
  "duration_seconds": 3600
}
```

### `POST /admin/agents/:agent_id/disable`

Emergency runtime control to quarantine a target agent.

- Requires:
1. `x-map-admin-token` matching `MAP_ADMIN_TOKEN`
2. valid MAP `signed_request` headers

### `POST /admin/agents/:agent_id/enable`

Re-enable a previously disabled agent.

### `POST /admin/agents/:agent_id/capabilities/:capability/disable`

Disable a single capability for a target agent.

### `POST /admin/agents/:agent_id/capabilities/:capability/enable`

Re-enable a previously disabled capability.

### `POST /admin/keys/:key_id/revoke`

Emergency revoke for a signing key at runtime (in addition to static env key config).

### `POST /admin/keys/:key_id/unrevoke`

Remove runtime revocation for a key ID.

### `GET /admin/keys`

Returns effective signing key state for control-plane automation:

- key metadata (`kid`, `alg`, `status`, `scopes`, `demo_only`)
- `is_active`, `signable`, and `status_source`
- optional `runtime_revocation` metadata (`revoked_at`, `revoked_by`, `reason`)
- summary (`active_kid`, key counts, asymmetric posture)
- trust metadata and key-provider status

Query parameters:

- `include_runtime` (`true` by default)
- `include_revoked` (`true` by default)

Requires:
1. `x-map-admin-token` matching `MAP_ADMIN_TOKEN`
2. valid MAP `signed_request` headers

### `GET /admin/runtime-controls`

Returns effective runtime control state used by enforcement:

- `disabled_agents`
- `disabled_capabilities`
- `revoked_keys`
- summary counts

Requires:
1. `x-map-admin-token` matching `MAP_ADMIN_TOKEN`
2. valid MAP `signed_request` headers

Request body (absolute timestamp):

```json
{
  "actor": "ops_user_2",
  "until": "2026-03-22T15:30:00.000Z"
}
```

### `GET /audit-events`

Returns security-relevant audit events captured by the MAP server.

Filters:

- `GET /audit-events?tenant_id=tenant_A`
- `GET /audit-events?limit=100`
- `GET /audit-events?cursor=250`
- `GET /audit-events?tenant_id=tenant_A&limit=50&cursor=120`

This route returns pagination metadata and supports `ETag` / `If-None-Match` (`304`).

Example response:

```json
{
  "events": [
    {
      "timestamp": "2026-03-21T12:00:00.000Z",
      "request_id": "req_123",
      "code": "rate_limited",
      "message": "Rate limit exceeded for MAP mutating requests.",
      "method": "POST",
      "route": "/dispatch",
      "tenant_id": "tenant_A",
      "target_agent": "dbread-agent-v1"
    }
  ],
  "checkpoints": [
    {
      "checkpoint_id": "audit-checkpoint:100",
      "created_at": "2026-03-21T12:00:05.000Z",
      "last_chain_index": 100,
      "last_event_hash": "6f2f...a8",
      "key_id": "map-dev-key-1",
      "signature": "eyJhbGciOi..."
    }
  ],
  "pagination": {
    "limit": 100,
    "next_cursor": 100
  }
}
```

Each event includes a tamper-evident hash chain (`chain_index`, `prev_event_hash`, `event_hash`), and checkpoints are periodically signed.

### `GET /audit-events/verify`

Validates audit hash-chain continuity and checkpoint signatures.

Example success response:

```json
{
  "verification": {
    "ok": true,
    "errors": [],
    "summary": {
      "events_checked": 120,
      "checkpoints_checked": 1,
      "latest_chain_index": 120
    }
  }
}
```

If verification fails, the route returns `500` with `verification.ok = false` and error identifiers.

### `GET /audit-events/export`

Returns an export snapshot containing audit events, checkpoints, and signed export metadata for offline verification.

Example response:

```json
{
  "export": {
    "export_id": "audit-export:9f3f...",
    "created_at": "2026-03-21T12:10:00.000Z",
    "events_count": 120,
    "checkpoints_count": 1,
    "latest_chain_index": 120,
    "latest_event_hash": "6f2f...a8",
    "key_id": "map-dev-key-1",
    "signature": "eyJhbGciOi..."
  },
  "events": [],
  "checkpoints": []
}
```

### `GET /conformance/export`

Returns a signed conformance artifact intended for CI/CD evidence publishing.

The artifact includes:

- deployment profile compliance snapshot
- writable-store readiness checks
- audit-integrity verification summary
- deterministic artifact hash signed with the active MAP signing key

Example response:

```json
{
  "conformance": {
    "export_id": "conformance-export:3c0f...",
    "created_at": "2026-03-22T12:30:00.000Z",
    "profile": "verified",
    "total_checks": 7,
    "passed_checks": 7,
    "failed_checks": 0,
    "artifact_hash": "6f8d...aa",
    "key_id": "map-dev-key-1",
    "signature": "eyJhbGciOi..."
  },
  "artifact": {
    "profile": "verified",
    "checks": [
      { "name": "deployment_profile_compliant", "ok": true },
      { "name": "task_store_writable", "ok": true }
    ]
  }
}
```

### `GET /trust-bundle/export`

Returns signed trust metadata and verification keys for offline verifier bootstrap.

Example response:

```json
{
  "trust_bundle": {
    "bundle_id": "trust-bundle:3f5c...",
    "created_at": "2026-03-22T12:40:00.000Z",
    "trust_domain": "map.local",
    "issuer": "map.reference",
    "profile": "verified",
    "keys_hash": "6a2f...cd",
    "key_id": "map-dev-key-1",
    "signature": "eyJhbGciOi..."
  },
  "keys": []
}
```

### `POST /dispatch`

Dispatches a MAP task to a target capability.

The request may include an optional invocation-time `negotiation` block. In the current MAP draft, this formalizes:

- schema version preference
- delivery mode preference (`sync` or `async`)

The response returns the resolved negotiation in both the result package and the execution receipt.

Request body:

```json
{
  "capability": "payment.execute",
  "requested_schema_version": "1.1.0",
  "negotiation": {
    "schema_version": "1.1.0",
    "delivery_mode": "sync"
  },
  "envelope": {
    "task_id": "task_123",
    "requester_identity": {
      "type": "user",
      "id": "user_42"
    },
    "target_agent": "payment-agent-v1",
    "intent": "Pay approved merchant for order ORD-223",
    "constraints": {
      "max_amount": 4500,
      "approved_vendor_only": true
    },
    "risk_class": "high",
    "delegation_token": "placeholder",
    "requested_output_mode": "summary"
  }
}
```

Success response:

```json
{
  "request_id": "req_123",
  "result": {
    "task_id": "task_123",
    "status": "completed",
    "requested_schema_version": "1.1.0",
    "executed_schema_version": "1.1.0",
    "negotiation": {
      "requested": {
        "schema_version": "1.1.0",
        "output_mode": "summary",
        "delivery_mode": "sync"
      },
      "selected": {
        "schema_version": "1.1.0",
        "output_mode": "summary",
        "delivery_mode": "sync"
      }
    }
  },
  "receipt": {
    "receipt_id": "receipt:task_123",
    "agent_id": "payment-agent-v1",
    "negotiation": {
      "requested": {
        "schema_version": "1.1.0",
        "output_mode": "summary",
        "delivery_mode": "sync"
      },
      "selected": {
        "schema_version": "1.1.0",
        "output_mode": "summary",
        "delivery_mode": "sync"
      }
    }
  }
}
```

Approval-required response:

```json
{
  "request_id": "req_124",
  "result": {
    "task_id": "task_db_prod",
    "status": "awaiting_approval",
    "summary": "Production database reads require approval.",
    "followup_required": true,
    "negotiation": {
      "requested": {
        "output_mode": "summary",
        "delivery_mode": "sync"
      },
      "selected": {
        "output_mode": "summary",
        "delivery_mode": "sync"
      }
    }
  },
  "receipt": {
    "receipt_id": "receipt:task_db_prod:approval",
    "agent_id": "dbread-agent-v1"
  }
}
```

Async-running response:

```json
{
  "request_id": "req_125",
  "result": {
    "task_id": "task_async_001",
    "status": "running",
    "summary": "Task accepted and running asynchronously.",
    "structured_output": {
      "poll_path": "/tasks/task_async_001"
    },
    "followup_required": true,
    "negotiation": {
      "requested": {
        "output_mode": "summary",
        "delivery_mode": "async"
      },
      "selected": {
        "output_mode": "summary",
        "delivery_mode": "async"
      }
    }
  },
  "receipt": {
    "receipt_id": "receipt:task_async_001:running",
    "agent_id": "dbread-agent-v1",
    "negotiation": {
      "requested": {
        "output_mode": "summary",
        "delivery_mode": "async"
      },
      "selected": {
        "output_mode": "summary",
        "delivery_mode": "async"
      }
    }
  }
}
```

### `POST /approve`

Approves a previously paused task and MAY include a `negotiation` block using the same shape as `POST /dispatch`.

### Invocation Negotiation Rules

MAP currently resolves invocation negotiation as follows:

1. `negotiation.schema_version` and `requested_schema_version` must not conflict.
2. If neither field is provided, the provider selects the preferred capability schema version.
3. If a provider translation rule exists, MAP records both the requested and executed schema version and includes `provider_actions: ["schema_translated"]`.
4. `negotiation.delivery_mode` controls sync vs async execution. If it conflicts with `envelope.metadata.async`, the request is invalid.
5. `envelope.requested_output_mode` must be supported by the target agent descriptor or MAP rejects the request with `unsupported_output_mode`.

Resumes a task that previously returned `awaiting_approval`.

Request body:

```json
{
  "task_id": "task_db_prod",
  "approval_reference": "approval:task_db_prod",
  "capability": "db.read.aggregate",
  "envelope": {
    "task_id": "task_db_prod",
    "requester_identity": {
      "type": "user",
      "id": "engineer_1"
    },
    "target_agent": "dbread-agent-v1",
    "intent": "Fetch production incident summary",
    "constraints": {
      "common": {
        "environment": "production",
        "redaction_level": "basic"
      },
      "domain": {
        "dataset": "incident_metrics",
        "service": "payments"
      }
    },
    "risk_class": "medium",
    "delegation_token": "placeholder",
    "requested_output_mode": "summary"
  }
}
```

Success response:

```json
{
  "result": {
    "task_id": "task_db_prod",
    "status": "completed"
  },
  "receipt": {
    "receipt_id": "receipt:task_db_prod",
    "approval_used": "approval:task_db_prod"
  }
}
```

## Error Contract

MAP HTTP responses should return structured JSON errors.

Example shape:

```json
{
  "request_id": "req_123",
  "error": {
    "code": "invalid_request",
    "message": "Invalid MAP task envelope: ...",
    "retryable": false,
    "details": {
      "category": "runtime"
    }
  }
}
```

Current error codes in the demo:

- `invalid_request`
- `auth_required`
- `invalid_auth`
- `schema_version_unsupported`
- `agent_not_found`
- `agent_disabled`
- `capability_not_found`
- `capability_disabled`
- `policy_denied`
- `approval_required`
- `not_found`
- `request_failed`
- `rate_limited`
- `alert_not_found`
- `agent_disabled`
- `capability_disabled`

## Status Code Guidance

The current demo uses:

- `200` for success
- `202` for approval-required or running tasks
- `401` for missing required authentication
- `403` for invalid authentication
- `400` for invalid or failed dispatch requests
- `404` for unknown routes
- `429` for mutating requests that exceed configured rate limits

The formal MAP HTTP binding should later distinguish more precisely between:

- malformed request
- schema validation failure
- policy denial
- approval required
- missing capability
- execution failure

## Relationship to the Protocol Spec

This transport draft is a thin HTTP binding over the core protocol objects defined in [`docs/protocol-spec.md`](./protocol-spec.md).

The next version should formalize:

- error schemas
- async task behavior
- authentication negotiation
- richer version-translation semantics
- pagination for discovery
- authentication and signing headers
- receipt and token signature headers or metadata
