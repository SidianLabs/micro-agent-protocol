# Quick Start Guide

This guide will help you get started with MAP Protocol in 5 minutes.

## Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 18+ | For running examples |
| npm | 9+ | Package management |

## 5-Minute Setup

### Step 1: Clone and Install

```bash
git clone https://github.com/mapprotocol/map.git
cd map
npm ci
npm run build
```

### Step 2: Start the Reference Server

```bash
cd src
npm run start
```

The server starts at `http://localhost:8787`.

### Step 3: Run Your First Dispatch

Create a file `quick-start.ts`:

```typescript
MAP/src/src/demo-payment.ts#L1-28
import { readFile } from "node:fs/promises";

const port = Number(process.env.PORT ?? 8787);
const baseUrl = `http://localhost:${port}`;

async function loadExample(name: string): Promise<unknown> {
  const fileUrl = new URL(`../../examples/${name}`, import.meta.url);
  const content = await readFile(fileUrl, "utf8");
  return JSON.parse(content);
}

async function main(): Promise<void> {
  const envelope = await loadExample("payment-task-envelope.json");

  const response = await fetch(`${baseUrl}/dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      capability: "payment.execute",
      envelope
    })
  });

  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Run it:

```bash
npx tsx quick-start.ts
```

### Step 4: Understand the Response

A successful dispatch returns:

```json
{
  "ok": true,
  "request_id": "req_abc123",
  "data": {
    "result": {
      "task_id": "task_123",
      "status": "completed",
      "summary": "Payment executed for approved vendor.",
      "structured_output": {
        "transaction_id": "txn_001",
        "amount": 4500
      }
    },
    "receipt": {
      "receipt_id": "receipt_abc",
      "signature": "sig_..."
    }
  }
}
```

---

## Examples

### Payment Processing Example

```typescript
MAP/examples/payment-task-envelope.json#L1-22
{
  "task_id": "task_123",
  "requester_identity": {
    "type": "user",
    "id": "user_42"
  },
  "target_agent": "payment-agent-v1",
  "intent": "Pay approved vendor for invoice INV-223",
  "constraints": {
    "common": {
      "resource_id": "vendor_abc",
      "max_amount": 4500,
      "currency": "INR"
    },
    "domain": {
      "invoice_id": "INV-223",
      "approved_vendor_only": true
    }
  },
  "risk_class": "high",
  "delegation_token": "signed-token-ref",
  "requested_output_mode": "summary"
}
```

### Database Read Example

```typescript
MAP/examples/dbread-task-envelope.json#L1-23
{
  "task_id": "task_db_001",
  "requester_identity": {
    "type": "user",
    "id": "engineer_17"
  },
  "target_agent": "dbread-agent-v1",
  "intent": "Fetch active incident summary for the payments service",
  "constraints": {
    "common": {
      "environment": "staging",
      "limit": 5,
      "redaction_level": "basic"
    },
    "domain": {
      "query_type": "aggregate",
      "dataset": "incident_metrics",
      "service": "payments"
    }
  },
  "risk_class": "medium",
  "delegation_token": "signed-token-ref",
  "requested_output_mode": "summary"
}
```

### With Approval Workflow

When a task requires approval, you receive an `approval_required` error:

```json
MAP/examples/error-handling-examples.json#L133-148
{
  "ok": false,
  "error": {
    "code": "approval_required",
    "message": "High risk operations require human approval",
    "retryable": false,
    "status": 202,
    "details": {
      "category": "authorization",
      "approval_reference": "apr_abc123",
      "context": {
        "risk_class": "high",
        "required_approvals": ["human_review"]
      }
    }
  }
}
```

To approve:

```bash
curl -X POST http://localhost:8787/approve \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task_123",
    "approval_reference": "apr_abc123",
    "capability": "payment.execute",
    "envelope": { ... }
  }'
```

---

## Common Patterns

### Error Handling

Always handle errors gracefully:

```typescript
const response = await fetch(`${baseUrl}/dispatch`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request)
});

const payload = await response.json();

if (!payload.ok) {
  const error = payload.error;
  
  if (error.retryable) {
    // Retry with exponential backoff
    await delay(error.details?.retry_after_ms ?? 1000);
    return retry();
  }
  
  // Handle non-retryable errors
  throw new Error(`${error.code}: ${error.message}`);
}
```

### Retry Logic

Implement exponential backoff for retryable errors:

```typescript
async function dispatchWithRetry(
  request: DispatchRequest,
  maxRetries = 3
): Promise<InvokeResult> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await dispatch(request);
      if (response.ok) return response.data;
      
      const error = response.error;
      if (!error?.retryable) throw new Error(error?.message);
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delayMs));
    } catch (e) {
      lastError = e;
    }
  }
  
  throw lastError;
}
```

### Idempotency

Use idempotency keys to prevent duplicate operations:

```typescript
const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;

await fetch(`${baseUrl}/dispatch`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-map-idempotency-key": taskId  // Prevents duplicate dispatch
  },
  body: JSON.stringify(request)
});
```

If you retry, use the same idempotency key. The server will recognize it and return the original result.

---

## Next Steps

- [SDK Guide](./sdk-guide.md) - Use TypeScript, Python, or Go SDKs
- [Security Guide](./security-guide.md) - Learn about authentication and signing
- [Policy Configuration](./policy-guide.md) - Configure policy evaluation
- [Deployment Guide](./deployment.md) - Deploy to production
