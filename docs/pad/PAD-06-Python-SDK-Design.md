# PAD-06: Python SDK Design

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Overview

The Python SDK provides a idiomatic Python interface for the MAP Protocol, enabling Python applications to dispatch tasks to micro-agents.

## 2. Package Structure

```
packages/python/
├── src/mapprotocol/
│   ├── __init__.py
│   ├── client.py        # Client implementation
│   ├── errors.py        # Error classes
│   ├── signing.py       # HMAC signing
│   ├── transport.py     # HTTP transport
│   └── types.py         # Type definitions
├── tests/
│   ├── conftest.py
│   ├── test_client.py
│   └── test_signing.py
├── pyproject.toml
└── README.md
```

## 3. Core Classes

### 3.1 Client

```python
from mapprotocol import Client

client = Client(base_url="https://api.mapprotocol.ai")
client.configure_signing(key_id="your-key-id", secret="your-secret")

result = client.dispatch({
    "capability": "payment.process",
    "envelope": { ... }
})
```

### 3.2 Methods

| Method | Description |
|--------|-------------|
| `dispatch(request)` | Dispatch a task |
| `approve(request)` | Approve a pending task |
| `get_task(task_id)` | Get task by ID |
| `list_tasks(**filters)` | List tasks |
| `get_agent(agent_id)` | Get agent by ID |
| `list_agents(**filters)` | List agents |
| `get_health()` | Health check |

## 4. Error Handling

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

## 5. Signing

The SDK supports HMAC-SHA256 signed requests:

```python
client.configure_signing(
    key_id="key-id",
    secret="secret-key"
)
```

## 6. Type Definitions

All type definitions are in `types.py`:
- `RiskLevel` - Enum for risk classification
- `TaskStatus` - Enum for task status
- `VisibilityMode` - Enum for output modes
- `RequesterIdentity` - TypedDict for identity
- `TaskEnvelope` - TypedDict for task envelope

## 7. Testing

Tests use pytest:

```bash
pip install -e .
pytest tests/
```

## 8. Dependencies

- `requests` - HTTP client
- `pytest` - Testing framework (dev)
- `pytest-asyncio` - Async testing (dev)