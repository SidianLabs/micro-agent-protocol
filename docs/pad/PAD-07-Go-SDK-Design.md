# PAD-07: Go SDK Design

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Overview

The Go SDK provides a Go-native interface for the MAP Protocol, following Go idioms and best practices.

## 2. Package Structure

```
packages/go/
├── mapproto/
│   ├── mapproto.go      # Package main
│   ├── types.go         # Type definitions
│   ├── errors.go        # Error types
│   ├── client.go        # Client implementation
│   ├── signing.go       # HMAC signing
│   ├── transport.go     # HTTP transport
│   └── client_test.go   # Unit tests
├── examples/
│   └── payment/
│       └── main.go      # Payment example
├── go.mod
└── README.md
```

## 3. Usage

```go
package main

import (
    "fmt"
    "github.com/mapprotocol/map/packages/go/mapproto"
)

func main() {
    client := mapproto.NewClient("https://api.mapprotocol.ai")
    client.ConfigureSigning("key-id", "secret-key")
    
    result, err := client.Dispatch(mapproto.DispatchRequest{
        Capability: "payment.process",
        Envelope: mapproto.TaskEnvelope{
            TaskID: "task-001",
            RequesterIdentity: mapproto.RequesterIdentity{
                Type: "user",
                ID:   "user-123",
            },
            TargetAgent:         "agent-payment",
            Intent:              "Process payment",
            RiskClass:          "medium",
            DelegationToken:    "tok_xxx",
            RequestedOutputMode: "full",
        },
    })
    if err != nil {
        fmt.Printf("Error: %v\n", err)
        return
    }
    fmt.Printf("Result: %+v\n", result)
}
```

## 4. Client Methods

| Method | Description |
|--------|-------------|
| `NewClient(baseURL string)` | Create new client |
| `(c *Client) ConfigureSigning(keyID, secret)` | Configure HMAC signing |
| `(c *Client) Dispatch(req DispatchRequest)` | Dispatch a task |
| `(c *Client) Approve(req ApprovalRequest)` | Approve pending task |
| `(c *Client) GetTask(taskID string)` | Get task by ID |
| `(c *Client) ListTasks(opts *ListTasksOptions)` | List tasks |
| `(c *Client) GetAgent(agentID string)` | Get agent by ID |
| `(c *Client) ListAgents(opts *ListAgentsOptions)` | List agents |
| `(c *Client) GetHealth()` | Health check |

## 5. Error Handling

```go
import "github.com/mapprotocol/map/packages/go/mapproto"

result, err := client.Dispatch(req)
if err != nil {
    if apiErr, ok := err.(*mapproto.APIError); ok {
        fmt.Printf("API Error: %s - %s\n", apiErr.Code, apiErr.Message)
        fmt.Printf("Retryable: %v\n", apiErr.Retryable)
    } else if validationErr, ok := err.(*mapproto.ValidationError); ok {
        fmt.Printf("Validation Error: %s\n", validationErr.Message)
    } else {
        fmt.Printf("Error: %v\n", err)
    }
}
```

## 6. Types

All types are defined in `types.go`:
- `RiskLevel` - string constants
- `TaskStatus` - string constants
- `VisibilityMode` - string constants
- `RequesterIdentity` - struct
- `TaskEnvelope` - struct
- `DispatchRequest` - struct
- `ResultPackage` - struct
- `ExecutionReceipt` - struct

## 7. Testing

```bash
go test ./...
```

## 8. Dependencies

- Go 1.21+
- Standard library only (no external dependencies)