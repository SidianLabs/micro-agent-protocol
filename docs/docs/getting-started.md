<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

---
sidebar_position: 0
title: Getting Started
---

# Getting Started with MAP Protocol

MAP (Micro Agent Protocol) is an open standard for AI assistant-to-micro-agent delegation with policy enforcement.

## Installation

Choose your preferred SDK:

```bash
# TypeScript/JavaScript
npm install @sidianlabs/map-client

# Python
pip install mapprotocol

# Go
go get github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto
```

## Quick Start

### TypeScript

```typescript
import { MapAssistantClient } from '@sidianlabs/map-client';

const client = MapAssistantClient.forBaseUrl('https://localhost:8787');

// Configure authentication
client.configureSigning('your-key-id', 'your-secret');

// Dispatch a task
const result = await client.dispatch({
  capability: 'payment.process',
  negotiation: {
    delivery_mode: 'sync',
  },
  envelope: {
    task_id: 'task-001',
    requester_identity: { type: 'user', id: 'user-123' },
    target_agent: 'agent-payment',
    intent: 'Process a payment of $100',
    constraints: { common: { max_amount: 1000 } },
    risk_class: 'medium',
    delegation_token: 'tok_xxx',
    requested_output_mode: 'full',
  },
});

console.log(result.result);
console.log(result.result.negotiation);
```

### Python

Preview note: the Python SDK package is not yet fully aligned with the current reference MAP HTTP contract.

```python
from mapprotocol import Client

client = Client(base_url="https://localhost:8787")
client.configure_signing(key_id="your-key-id", secret="your-secret")

result = client.dispatch({
    "capability": "payment.process",
    "envelope": {
        "task_id": "task-001",
        "requester_identity": {"type": "user", "id": "user-123"},
        "target_agent": "agent-payment",
        "intent": "Process a payment of $100",
        "constraints": {"common": {"max_amount": 1000}},
        "risk_class": "medium",
        "delegation_token": "tok_xxx",
        "requested_output_mode": "full",
    },
})

print(result)
```

### Go

Preview note: the Go SDK package is not yet fully aligned with the current reference MAP HTTP contract.

```go
package main

import (
    "github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto"
)

func main() {
    client := mapproto.NewClient("https://localhost:8787")
    client.ConfigureSigning("your-key-id", "your-secret")
    
    result, err := client.Dispatch(mapproto.DispatchRequest{
        Capability: "payment.process",
        Envelope: mapproto.TaskEnvelope{
            TaskID: "task-001",
            RequesterIdentity: mapproto.RequesterIdentity{
                Type: "user",
                ID: "user-123",
            },
            TargetAgent: "agent-payment",
            Intent: "Process a payment of $100",
            Constraints: map[string]any{"common": map[string]any{"max_amount": 1000}},
            RiskClass: "medium",
            DelegationToken: "tok_xxx",
            RequestedOutputMode: "full",
        },
    })
}
```

## Next Steps

- [Protocol Specification](./protocol-spec) - Learn about the MAP protocol in detail
- [TypeScript SDK](./sdk/typescript) - TypeScript SDK reference
- [Architecture](./architecture) - System architecture overview
