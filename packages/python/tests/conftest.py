# SPDX-License-Identifier: Apache-2.0
"""
Pytest fixtures for MAP Protocol tests.
"""

import pytest
import msgspec
from mapprotocol.types import (
    RequesterIdentity,
    TaskConstraints,
    TaskEnvelope,
    DispatchRequest,
    RiskLevel,
    VisibilityMode,
    ExecutionMode,
    RequesterIdentityType,
)


@pytest.fixture
def sample_requester_identity():
    """Create a sample requester identity."""
    return RequesterIdentity(
        type=RequesterIdentityType.USER,
        id="user-123",
        name="Test User",
        metadata={"email": "test@example.com"},
    )


@pytest.fixture
def sample_task_constraints():
    """Create a sample task constraints object."""
    return TaskConstraints(
        timeout_seconds=300,
        max_retries=3,
        risk_level=RiskLevel.LOW,
        visibility=VisibilityMode.PRIVATE,
        execution_mode=ExecutionMode.SYNCHRONOUS,
        tags=["test", "sample"],
    )


@pytest.fixture
def sample_task_envelope(sample_requester_identity, sample_task_constraints):
    """Create a sample task envelope."""
    return TaskEnvelope(
        id="task-abc-123",
        requester=sample_requester_identity,
        description="A sample task for testing",
        constraints=sample_task_constraints,
        payload={"action": "process", "data": "sample data"},
        created_at="2024-01-15T10:30:00Z",
        metadata={"priority": "normal"},
    )


@pytest.fixture
def sample_dispatch_request(sample_task_envelope):
    """Create a sample dispatch request."""
    return DispatchRequest(
        task=sample_task_envelope,
        delegation_token=None,
        callback_url=None,
    )


@pytest.fixture
def mock_server():
    """
    Create a mock server fixture.
    
    In a real implementation, this would start a test server
    or use responses/httpx mock to simulate the API.
    """
    pass
