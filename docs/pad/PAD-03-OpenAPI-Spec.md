# PAD-03: OpenAPI 3.1 Specification Design

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Overview

The MAP Protocol uses HTTP as its primary transport binding. The OpenAPI 3.1 specification defines all REST endpoints for task dispatch, approval, and querying.

## 2. Base URL

```
Production: https://api.mapprotocol.ai/v1
Staging: https://staging.api.mapprotocol.ai/v1
Development: http://localhost:8080/v1
```

## 3. Authentication

### 3.1 Signed Request Authentication

```
Headers:
  X-MAP-Auth-Scheme: signed_request
  X-MAP-Key-Id: {key_id}
  X-MAP-Timestamp: {ISO8601_timestamp}
  X-MAP-Request-Signature: {HMAC_signature}
```

### 3.2 Signature Generation

```
StringToSign = HTTP_METHOD + "\n" +
               PATH + "\n" +
               TIMESTAMP + "\n" +
               SHA256(BODY)

Signature = Base64URL(HMAC-SHA256(SecretKey, StringToSign))
```

## 4. Endpoints

### 4.1 Task Dispatch

| Method | Path | Description |
|--------|------|-------------|
| POST | /dispatch | Dispatch a new task |
| POST | /approve | Approve a pending task |

#### POST /dispatch

**Request:**
```json
{
  "capability": "payment.process",
  "requested_schema_version": "1.0.0",
  "envelope": {
    "task_id": "task_abc123",
    "requester_identity": {
      "type": "user",
      "id": "user_123",
      "tenant_id": "tenant_abc"
    },
    "target_agent": "agent-payment",
    "intent": "Process payment of $100",
    "constraints": {
      "common": {
        "max_amount": 100,
        "currency": "USD"
      }
    },
    "risk_class": "medium",
    "delegation_token": "tok_xxx",
    "requested_output_mode": "full"
  }
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "request_id": "req_xyz789",
  "data": {
    "result": {
      "task_id": "task_abc123",
      "status": "completed",
      "structured_output": {
        "payment_id": "pay_123",
        "amount": 100,
        "currency": "USD"
      },
      "followup_required": false
    },
    "receipt": {
      "receipt_id": "rcpt_abc",
      "task_id": "task_abc123",
      "agent_id": "agent-payment",
      "action_taken": "payment.process",
      "policy_checks": ["amount_check", "fraud_check"],
      "timestamp": "2024-01-15T10:30:00Z",
      "result_hash": "hash_abc",
      "signature": "sig_xyz"
    }
  }
}
```

### 4.2 Task Query

| Method | Path | Description |
|--------|------|-------------|
| GET | /tasks/{task_id} | Get task by ID |
| GET | /tasks | List tasks with filters |

#### GET /tasks

**Query Parameters:**
- `tenant_id` - Filter by tenant
- `status` - Filter by status
- `capability` - Filter by capability
- `agent_id` - Filter by agent
- `limit` - Page size (default 50)
- `cursor` - Pagination cursor

### 4.3 Agent Discovery

| Method | Path | Description |
|--------|------|-------------|
| GET | /agents | List available agents |
| GET | /agents/{agent_id} | Get agent by ID |

#### GET /agents

**Query Parameters:**
- `domain` - Filter by domain
- `capability` - Filter by capability
- `status` - Filter by status

### 4.4 Health Check

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Service health status |

## 5. Error Responses

### 5.1 Error Format

```json
{
  "ok": false,
  "request_id": "req_xyz789",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "retryable": false,
    "details": {
      "field": "envelope.risk_class",
      "reason": "Invalid value"
    }
  }
}
```

### 5.2 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid request format |
| AUTHENTICATION_ERROR | 401 | Invalid credentials |
| AUTHORIZATION_ERROR | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Task state conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

## 6. Schema Files

The OpenAPI specification is located at:
- `schemas/openapi.yaml` - Full OpenAPI 3.1 specification

Additional JSON schemas:
- `schemas/task-envelope.json` - Task envelope schema
- `schemas/dispatch-request.json` - Dispatch request schema
- `schemas/result-package.json` - Result package schema
- `schemas/execution-receipt.json` - Execution receipt schema
- `schemas/delegation-token.json` - Delegation token schema