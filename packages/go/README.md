<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol Go SDK

Go SDK for Micro Agent Protocol (MAP) — policy enforcement and audit trails for AI agents.

**Status:** Preview. The package builds and the client surface is usable, but the docs and examples are still being tightened.

## Installation

```bash
go get github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto
```

## Quick Start

```go
package main

import (
    "context"
    "log"
    "time"

    mapproto "github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto"
)

func main() {
    ctx := context.Background()

    signer := mapproto.NewHMACSigner([]byte("your-secret-key"), "ethereum:0xYourAddress")
    client, err := mapproto.NewClient(
        mapproto.WithBaseURL("http://localhost:8787"),
        mapproto.WithTimeout(30*time.Second),
        mapproto.WithSigner(signer),
    )
    if err != nil {
        log.Fatal(err)
    }

    result, err := client.Dispatch(ctx, &mapproto.DispatchRequest{
        Capability: "payment.execute",
        Envelope: &mapproto.TaskEnvelope{
            TaskID: "task-123",
            RequesterIdentity: &mapproto.RequesterIdentity{
                Type: "user",
                ID:   "user-abc",
            },
            Intent: `{"amount": 5000}`,
        },
    })
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("Result: %+v", result)
}
```

## API

See the [MAP Protocol specification](../../spec/MAP-SPEC-v1.md) for protocol details.

## Running Tests

```bash
cd packages/go
go test -race -count=1 ./...
```

## Client Options

```go
// Base URL (defaults to http://localhost:8787)
mapproto.WithBaseURL("http://localhost:8787")

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

## Notes

- Use the import path shown in the first quick-start example: `github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto`.
- Treat the quick start above as the canonical example until the broader README examples are refreshed to the current API surface.

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
