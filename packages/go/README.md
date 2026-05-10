# MAP Protocol Go SDK

Go SDK preview for interacting with the MAP Protocol network.

**Status:** Preview source package. This package is not yet fully aligned with the current reference MAP HTTP contract. Use the TypeScript SDK as the canonical client surface today.

**⚠️ Note:** This SDK is in preview status. API may change in 0.x releases.

## Installation

This module is not published as a released Go package yet. Use it from the repository source:

```bash
go test ./...
```

## Quick Start

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/mapprotocol/go/mapproto"
)

func main() {
    ctx := context.Background()

    signer := mapproto.NewHMACSigner(
        []byte("your-secret-key"),
        "ethereum:0xYourAddress",
    )

    client, err := mapproto.NewClient(
        mapproto.WithBaseURL("https://api.mapprotocol.io"),
        mapproto.WithTimeout(30*time.Second),
        mapproto.WithSigner(signer),
    )
    if err != nil {
        log.Fatalf("Failed to create client: %v", err)
    }

    // Check health
    health, err := client.GetHealth(ctx)
    if err != nil {
        log.Fatalf("Health check failed: %v", err)
    }
    fmt.Printf("Connected to MAP Protocol API %s\n", health.Version)
}
```

## Client Options

```go
// Base URL (defaults to https://api.mapprotocol.io)
mapproto.WithBaseURL("https://api.mapprotocol.io")

// Request timeout
mapproto.WithTimeout(30 * time.Second)

// Request signer
mapproto.WithSigner(signer)

// Custom HTTP transport
mapproto.WithTransport(transport)
```

## Signers

### HMAC Signer

```go
signer := mapproto.NewHMACSigner([]byte("secret"), "ethereum:0xAddress")
```

### RSA Signer

```go
signer, err := mapproto.NewRSASigner(privateKeyPEM, "key-id")
if err != nil {
    log.Fatal(err)
}
```

## Dispatching Tasks

```go
dispatchReq := mapproto.DispatchRequest{
    Envelope: mapproto.TaskEnvelope{
        Requester: mapproto.RequesterIdentity{
            Address: "0xYourAddress",
            ChainID: "ethereum",
        },
        Constraints: mapproto.TaskConstraints{
            MaxBudget:   "1000000",
            MaxDuration: 300,
            RiskLevel:   mapproto.RiskLevelLow,
            RequiredTags: []string{"payment"},
            Timeout:      60,
        },
        Payload:   []byte(`{"type":"payment","to":"0xRecipient","amount":"1000"}`),
        CreatedAt: time.Now().Unix(),
        ExpiresAt: time.Now().Add(5 * time.Minute).Unix(),
    },
}

task, err := client.Dispatch(ctx, dispatchReq)
if err != nil {
    log.Fatalf("Dispatch failed: %v", err)
}
fmt.Printf("Task ID: %s\n", task.ID)
```

## Querying Tasks

```go
// Get single task
task, err := client.GetTask(ctx, taskID)

// List tasks by status
response, err := client.ListTasks(ctx, mapproto.TaskStatusCompleted, 1, 20)
for _, t := range response.Tasks {
    fmt.Printf("Task: %s, Status: %s\n", t.ID, t.Status)
}
```

## Listing Agents

```go
agents, err := client.ListAgents(ctx, []string{"payment"}, 1, 20)
for _, agent := range agents {
    fmt.Printf("Agent: %s (%s)\n", agent.Name, agent.AgentID)
}
```

## Approval Workflow

```go
// For tasks requiring approval
approvalReq, err := client.GetApprovalRequest(ctx, requestID)
if err != nil {
    log.Fatal(err)
}

// Approve or reject
err = client.Approve(ctx, requestID, true) // or false
```

## Error Handling

```go
_, err := client.Dispatch(ctx, req)
if err != nil {
    var mapErr *mapproto.MapError
    if errors.As(err, &mapErr) {
        fmt.Printf("Error code: %s, Message: %s\n", mapErr.Code, mapErr.Message)
        
        if mapErr.Code == mapproto.ErrCodeApprovalRequired {
            // Handle approval required
        }
    }
}
```

## Examples

See the `examples/` directory for complete examples:

- `examples/payment/` - Payment flow example

## Risk Levels

```go
mapproto.RiskLevelNone     // No risk
mapproto.RiskLevelLow      // Low risk
mapproto.RiskLevelMedium   // Medium risk
mapproto.RiskLevelHigh     // High risk
mapproto.RiskLevelCritical // Critical risk
```

## Task Status

```go
mapproto.TaskStatusPending    // Task is pending
mapproto.TaskStatusRunning     // Task is executing
mapproto.TaskStatusCompleted   // Task completed successfully
mapproto.TaskStatusFailed      // Task failed
mapproto.TaskStatusCancelled   // Task was cancelled
```

## License

Apache 2.0 - see LICENSE file for details.
