# SPDX-License-Identifier: Apache-2.0
# MAP Protocol Python SDK

Python SDK for Micro Agent Protocol (MAP).

**Status:** Preview release (0.1.0). This package is not yet fully aligned with the current reference MAP HTTP contract. Use the TypeScript SDK as the canonical client surface today.

**⚠️ Note:** This SDK is in preview status. API may change in 0.x releases.

## Installation

```bash
pip install mapprotocol==0.1.0
```

## Quick Start

### Synchronous Client

```python
from mapprotocol import MapAssistantClient, DispatchRequest, TaskEnvelope, RequesterIdentity, TaskConstraints

# Initialize client
client = MapAssistantClient(base_url="http://localhost:8787")

# Configure HMAC signing (optional)
client.configure_signing(key_id="your-key-id", secret="your-secret")

# Create a task
task = TaskEnvelope(
    id="task-123",
    requester=RequesterIdentity(type="user", id="user-1", name="Test User"),
    description="Process some data",
    constraints=TaskConstraints(timeout_seconds=300),
    payload={"action": "process", "data": "sample"}
)

# Dispatch the task
request = DispatchRequest(task=task)
response = client.dispatch(request)

# Get task status
task_record = client.get_task(task_id="task-123")

# List tasks
tasks = client.list_tasks(status="pending")

# Get health status
health = client.get_health()

# Close client
client.close()
```

### Asynchronous Client

```python
import asyncio
from mapprotocol import AsyncMapAssistantClient, DispatchRequest, TaskEnvelope

async def main():
    client = AsyncMapAssistantClient(base_url="http://localhost:8787")
    
    # Configure signing
    client.configure_signing(key_id="your-key-id", secret="your-secret")
    
    # Create and dispatch task
    task = TaskEnvelope(...)
    request = DispatchRequest(task=task)
    response = await client.dispatch(request)
    
    # Async operations
    task_record = await client.get_task(task_id="task-123")
    tasks = await client.list_tasks()
    agents = await client.list_agents()
    
    await client.close()

asyncio.run(main())
```

## Error Handling

```python
from mapprotocol import MapAssistantClient
from mapprotocol.errors import MapAPIError, MapValidationError, MapTimeoutError

client = MapAssistantClient()

try:
    client.dispatch(request)
except MapAPIError as e:
    print(f"API Error: {e.code} - {e.message}")
    print(f"Retryable: {e.retryable}")
except MapValidationError as e:
    print(f"Validation Error: {e.message}")
    print(f"Field: {e.field}")
except MapTimeoutError as e:
    print(f"Timeout: {e.message}")
finally:
    client.close()
```

## Available Types

- **Enums**: `RiskLevel`, `TaskStatus`, `VisibilityMode`, `ExecutionMode`, `RequesterIdentityType`
- **Dataclasses**: `RequesterIdentity`, `TaskConstraints`, `TaskEnvelope`, `DelegationToken`, `ResultPackage`, `ExecutionReceipt`, `InvokeResult`, `DispatchRequest`, `ApprovalRequest`, `AgentDescriptor`, `TaskRecord`

## Development

```bash
# Install dependencies
poetry install

# Run tests
poetry run pytest

# Run tests with coverage
poetry run pytest --cov=mapprotocol

# Type checking
poetry run mypy

# Linting
poetry run ruff check

# Formatting
poetry run black .
```

## License

Apache 2.0
