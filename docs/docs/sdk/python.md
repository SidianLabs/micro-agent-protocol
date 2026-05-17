<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

---
sidebar_position: 2
title: Python SDK
---

# Python SDK

Preview status: the Python package exists, but it is not yet fully aligned with the current reference MAP HTTP contract. Treat it as a design preview until the rewrite lands.

The official Python SDK for MAP Protocol.

## Installation

```bash
pip install mapprotocol
```

## Requirements

- Python 3.10 or higher

## Usage

```python
from mapprotocol import Client, RiskLevel, VisibilityMode

# Create a client
client = Client(base_url="https://api.mapprotocol.ai")

# Configure signing
client.configure_signing(key_id="key-id", secret="secret-key")

# Dispatch a task
result = client.dispatch({
    "capability": "payment.process",
    "envelope": {
        "task_id": "task-001",
        "requester_identity": {"type": "user", "id": "user-123"},
        "target_agent": "agent-payment",
        "intent": "Process payment",
        "constraints": {"common": {"max_amount": 1000}},
        "risk_class": "medium",
        "delegation_token": "tok_xxx",
        "requested_output_mode": "full",
    },
})

print(result)
```

## API Reference

### Client

The main client class for interacting with MAP Protocol.

#### `Client(base_url: str, timeout: int = 30)`

Create a new client instance.

#### `configure_signing(key_id: str, secret: str) -> None`

Configure HMAC signing for requests.

#### `dispatch(request: dict) -> InvokeResult`

Dispatch a task to a micro-agent.

#### `approve(request: dict) -> InvokeResult`

Approve a pending task.

#### `get_task(task_id: str, tenant_id: Optional[str] = None) -> TaskRecord`

Get a task by ID.

#### `list_tasks(...) -> ListTasksResult`

List tasks with optional filters.

#### `list_agents(...) -> ListAgentsResult`

List agents with optional filters.

#### `get_health() -> dict`

Get the health status of the service.

## Error Handling

```python
from mapprotocol import MapError, MapAPIError, MapValidationError

try:
    client.dispatch(request)
except MapAPIError as e:
    print(f"API Error: {e.code} - {e.message}")
    print(f"Retryable: {e.retryable}")
except MapValidationError as e:
    print(f"Validation Error: {e.message}")
except MapError as e:
    print(f"MAP Error: {e.message}")
```
