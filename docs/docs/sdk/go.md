<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

---
sidebar_position: 3
title: Go SDK
---

# Go SDK

Preview status: the Go package exists, but it is not yet fully aligned with the current reference MAP HTTP contract. Treat it as a design preview until the rewrite lands.

The official Go SDK for MAP Protocol.

## Installation

```bash
go get github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto
```

## Requirements

- Go 1.21 or higher

## Usage

```go
package main

import (
    "fmt"
    "github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto"
)

func main() {
    // Create a client
    client := mapproto.NewClient("https://localhost:8787")

    // Configure signing
    client.ConfigureSigning("key-id", "secret-key")

    // Dispatch a task
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
            Constraints:        map[string]any{"common": map[string]any{"max_amount": 1000}},
            RiskClass:           "medium",
            DelegationToken:     "tok_xxx",
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

## API Reference

### Client

The main client type for interacting with MAP Protocol.

#### `NewClient(baseURL string) *Client`

Create a new client instance.

#### `(c *Client) ConfigureSigning(keyID, secret string)`

Configure HMAC signing for requests.

#### `(c *Client) Dispatch(req DispatchRequest) (*InvokeResult, error)`

Dispatch a task to a micro-agent.

#### `(c *Client) Approve(req ApprovalRequest) (*InvokeResult, error)`

Approve a pending task.

#### `(c *Client) GetTask(taskID string) (*TaskRecord, error)`

Get a task by ID.

#### `(c *Client) ListTasks(opts *ListTasksOptions) (*ListTasksResult, error)`

List tasks with optional filters.

#### `(c *Client) ListAgents(opts *ListAgentsOptions) (*ListAgentsResult, error)`

List agents with optional filters.

#### `(c *Client) GetHealth() (*HealthResult, error)`

Get the health status of the service.

## Error Handling

```go
import "github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto"

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
