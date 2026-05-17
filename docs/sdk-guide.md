<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# SDK Guide

MAP Protocol provides official SDKs for TypeScript, Python, and Go.

## TypeScript SDK

### Installation

```bash
cd packages/typescript
npm install
npm run build
```

### Basic Usage

```typescript
import { MapAssistantClient } from './src';

const client = MapAssistantClient.forBaseUrl('https://api.map-protocol.dev/v1');
client.configureSigning('key-id', 'secret');

const result = await client.dispatch({
  capability: 'payment.execute',
  envelope: {
    task_id: `task_${Date.now()}`,
    requester_identity: { type: 'user', id: 'user_42' },
    target_agent: 'payment-agent-v1',
    intent: 'Pay vendor for invoice',
    constraints: {
      common: { resource_id: 'vendor_abc', max_amount: 1000 }
    },
    risk_class: 'medium',
    delegation_token: 'your-token',
    requested_output_mode: 'summary'
  }
});
```

### TypeScript Examples

#### Payment Dispatch

```typescript
import { MapAssistantClient } from '@sidianlabs/map-client';
import type { DispatchRequest, InvokeResult } from '@sidianlabs/map-client';

const client = MapAssistantClient.forBaseUrl(process.env.MAP_API_URL!);
client.configureSigning(
  process.env.MAP_KEY_ID!,
  process.env.MAP_SECRET!
);

async function processPayment(
  userId: string,
  vendorId: string,
  amount: number,
  invoiceId: string
): Promise<InvokeResult> {
  const request: DispatchRequest = {
    capability: 'payment.execute',
    envelope: {
      task_id: `payment_${Date.now()}`,
      requester_identity: {
        type: 'user',
        id: userId,
        tenant_id: 'tenant_acme'
      },
      target_agent: 'payment-agent-v1',
      intent: `Pay vendor ${vendorId} for invoice ${invoiceId}`,
      constraints: {
        common: {
          resource_id: vendorId,
          max_amount: amount,
          currency: 'USD'
        },
        domain: {
          invoice_id: invoiceId,
          approved_vendor_only: true
        }
      },
      risk_class: amount > 1000 ? 'high' : 'medium',
      delegation_token: await getDelegationToken(),
      requested_output_mode: 'summary'
    }
  };

  return client.dispatch(request);
}
```

#### Database Read

```typescript
import type { TaskEnvelope, VisibilityMode } from '@sidianlabs/map-client';

async function queryDatabase(
  userId: string,
  dataset: string,
  limit: number
): Promise<InvokeResult> {
  const envelope: TaskEnvelope = {
    task_id: `dbread_${Date.now()}`,
    requester_identity: {
      type: 'user',
      id: userId,
      tenant_id: 'tenant_acme'
    },
    target_agent: 'dbread-agent-v1',
    intent: `Fetch ${dataset} metrics`,
    constraints: {
      common: {
        environment: 'staging',
        limit: limit,
        redaction_level: 'basic'
      },
      domain: {
        query_type: 'aggregate',
        dataset: dataset
      }
    },
    risk_class: 'medium',
    delegation_token: await getDelegationToken(),
    requested_output_mode: 'structured_only' as VisibilityMode
  };

  const result = await client.dispatch({
    capability: 'db.read.aggregate',
    envelope
  });

  return result;
}
```

#### Async Task Polling

```typescript
import { MapAssistantClient } from '@sidianlabs/map-client';

const client = MapAssistantClient.forBaseUrl(process.env.MAP_API_URL!);

async function dispatchAndWait(
  taskId: string,
  capability: string,
  envelope: any,
  timeoutMs = 30000
): Promise<any> {
  // Dispatch the task
  const { result } = await client.dispatch({ capability, envelope });
  
  if (result.status === 'completed') {
    return result;
  }
  
  // Poll for completion
  const startTime = Date.now();
  while (result.status === 'running' || result.status === 'accepted') {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Task timeout exceeded');
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    const task = await client.getTask(taskId);
    if (task.result) {
      return task.result;
    }
  }
  
  return result;
}
```

### Client Configuration

```typescript
const client = MapAssistantClient.forBaseUrl('https://api.map-protocol.dev/v1', {
  // Timeout in milliseconds
  timeout: 30000,
  
  // Default headers
  headers: {
    'X-Custom-Header': 'value'
  },
  
  // Retry configuration
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000
  }
});
```

---

## Python SDK

### Installation

```bash
git clone https://github.com/SidianLabs/micro-agent-protocol.git
cd map/packages/python
pip install -e .
```

### Basic Usage

```python
from mapprotocol import Client

client = Client(base_url="https://api.map-protocol.ai")
client.configure_signing(key_id="key-id", secret="secret")
result = client.dispatch({ ... })
```

### Python Examples

#### Payment Dispatch

```python
from mapprotocol import Client
from mapprotocol.types import TaskEnvelope, RequesterIdentity
from datetime import datetime, timedelta

client = Client(base_url="https://api.map-protocol.ai")
client.configure_signing(key_id="key-id", secret="secret")

def process_payment(
    user_id: str,
    vendor_id: str,
    amount: float,
    invoice_id: str
):
    envelope = TaskEnvelope(
        task_id=f"payment_{datetime.now().timestamp()}",
        requester_identity=RequesterIdentity(
            type="user",
            id=user_id,
            tenant_id="tenant_acme"
        ),
        target_agent="payment-agent-v1",
        intent=f"Pay vendor {vendor_id} for invoice {invoice_id}",
        constraints={
            "common": {
                "resource_id": vendor_id,
                "max_amount": amount,
                "currency": "USD"
            },
            "domain": {
                "invoice_id": invoice_id,
                "approved_vendor_only": True
            }
        },
        risk_class="high" if amount > 1000 else "medium",
        delegation_token=get_delegation_token(),
        requested_output_mode="summary"
    )
    
    return client.dispatch(
        capability="payment.execute",
        envelope=envelope
    )
```

#### Database Read

```python
from mapprotocol import Client
from mapprotocol.types import TaskEnvelope, VisibilityMode

client = Client(base_url="https://api.map-protocol.ai")
client.configure_signing(key_id="key-id", secret="secret")

def query_metrics(
    user_id: str,
    dataset: str,
    limit: int = 5
):
    envelope = TaskEnvelope(
        task_id=f"dbread_{datetime.now().timestamp()}",
        requester_identity={
            "type": "user",
            "id": user_id,
            "tenant_id": "tenant_acme"
        },
        target_agent="dbread-agent-v1",
        intent=f"Fetch {dataset} metrics",
        constraints={
            "common": {
                "environment": "staging",
                "limit": limit,
                "redaction_level": "basic"
            },
            "domain": {
                "query_type": "aggregate",
                "dataset": dataset
            }
        },
        risk_class="medium",
        delegation_token=get_delegation_token(),
        requested_output_mode=VisibilityMode.STRUCTURED_ONLY
    )
    
    return client.dispatch(
        capability="db.read.aggregate",
        envelope=envelope
    )
```

#### Error Handling

```python
from mapprotocol import Client
from mapprotocol.exceptions import MapAPIError, MapRetryableError

client = Client(base_url="https://api.map-protocol.ai")

def dispatch_with_retry(request, max_retries=3):
    last_error = None
    
    for attempt in range(max_retries):
        try:
            result = client.dispatch(request)
            if result.ok:
                return result.data
        except MapRetryableError as e:
            last_error = e
            delay_ms = e.retry_after_ms or (1000 * (2 ** attempt))
            time.sleep(delay_ms / 1000)
        except MapAPIError as e:
            if not e.retryable:
                raise
            last_error = e
    
    raise last_error
```

---

## Go SDK

### Installation

```bash
git clone https://github.com/SidianLabs/micro-agent-protocol.git
cd map/packages/go
go test ./...
```

### Basic Usage

```go
package main

import (
    "context"
    mapproto "github.com/SidianLabs/micro-agent-protocol/go"
)

func main() {
    client := mapproto.NewClient("https://api.map-protocol.ai")
    client.ConfigureSigning("key-id", "secret")
    
    result, err := client.Dispatch(context.Background(), req)
}
```

### Go Examples

#### Payment Dispatch

```go
package main

import (
    "context"
    "fmt"
    "time"
    
    mapproto "github.com/SidianLabs/micro-agent-protocol/go"
    "github.com/SidianLabs/micro-agent-protocol/go/types"
)

func processPayment(
    ctx context.Context,
    client *mapproto.Client,
    userID, vendorID string,
    amount float64,
    invoiceID string,
) (*types.InvokeResult, error) {
    
    taskID := fmt.Sprintf("payment_%d", time.Now().UnixMilli())
    
    envelope := types.TaskEnvelope{
        TaskID: taskID,
        RequesterIdentity: types.RequesterIdentity{
            Type:    "user",
            ID:      userID,
            TenantID: "tenant_acme",
        },
        TargetAgent: "payment-agent-v1",
        Intent:      fmt.Sprintf("Pay vendor %s for invoice %s", vendorID, invoiceID),
        Constraints: map[string]interface{}{
            "common": map[string]interface{}{
                "resource_id": vendorID,
                "max_amount":  amount,
                "currency":   "USD",
            },
            "domain": map[string]interface{}{
                "invoice_id":           invoiceID,
                "approved_vendor_only": true,
            },
        },
        RiskClass:            "medium",
        DelegationToken:      getDelegationToken(),
        RequestedOutputMode:   "summary",
    }
    
    req := &types.DispatchRequest{
        Capability: "payment.execute",
        Envelope:   envelope,
    }
    
    return client.Dispatch(ctx, req)
}
```

#### Database Read

```go
package main

import (
    "context"
    "fmt"
    "time"
    
    mapproto "github.com/SidianLabs/micro-agent-protocol/go"
    "github.com/SidianLabs/micro-agent-protocol/go/types"
)

func queryMetrics(
    ctx context.Context,
    client *mapproto.Client,
    userID, dataset string,
    limit int,
) (*types.InvokeResult, error) {
    
    taskID := fmt.Sprintf("dbread_%d", time.Now().UnixMilli())
    
    envelope := types.TaskEnvelope{
        TaskID: taskID,
        RequesterIdentity: types.RequesterIdentity{
            Type:    "user",
            ID:      userID,
            TenantID: "tenant_acme",
        },
        TargetAgent: "dbread-agent-v1",
        Intent:      fmt.Sprintf("Fetch %s metrics", dataset),
        Constraints: map[string]interface{}{
            "common": map[string]interface{}{
                "environment":    "staging",
                "limit":         limit,
                "redaction_level": "basic",
            },
            "domain": map[string]interface{}{
                "query_type": "aggregate",
                "dataset":   dataset,
            },
        },
        RiskClass:            "medium",
        DelegationToken:      getDelegationToken(),
        RequestedOutputMode:   "structured_only",
    }
    
    req := &types.DispatchRequest{
        Capability: "db.read.aggregate",
        Envelope:   envelope,
    }
    
    return client.Dispatch(ctx, req)
}
```

#### Error Handling

```go
package main

import (
    "context"
    "errors"
    "time"
    
    mapproto "github.com/SidianLabs/micro-agent-protocol/go"
    "github.com/SidianLabs/micro-agent-protocol/go/types"
)

func dispatchWithRetry(
    ctx context.Context,
    client *mapproto.Client,
    req *types.DispatchRequest,
) (*types.InvokeResult, error) {
    
    const maxRetries = 3
    var lastErr error
    
    for attempt := 0; attempt < maxRetries; attempt++ {
        result, err := client.Dispatch(ctx, req)
        if err == nil {
            return result, nil
        }
        
        var apiErr *types.MapAPIError
        if errors.As(err, &apiErr) {
            if !apiErr.Retryable {
                return nil, err
            }
            lastErr = err
            
            delay := time.Duration(apiErr.RetryAfterMs) * time.Millisecond
            if delay == 0 {
                delay = time.Duration(1000*(1<<attempt)) * time.Millisecond
            }
            
            select {
            case <-ctx.Done():
                return nil, ctx.Err()
            case <-time.After(delay):
                continue
            }
        } else {
            return nil, err
        }
    }
    
    return nil, lastErr
}
```

---

## SDK Comparison

| Feature | TypeScript | Python | Go |
|---------|-----------|--------|-----|
| Installation | npm | pip | go get |
| Status | Canonical | Preview | Preview |
| Signed Requests | ✅ | ✅ | ✅ |
| Async Support | ✅ | ✅ | ✅ |
| Retry Logic | ✅ | ✅ | ✅ |
| SSE Streaming | ✅ | ❌ | ❌ |
| Type Safety | Strict | Type hints | Static |

---

## Next Steps

- [Security Guide](./security-guide.md) - Authentication and signing details
- [Policy Configuration](./policy-guide.md) - Policy engine usage
- [Deployment Guide](./deployment.md) - Production deployment
