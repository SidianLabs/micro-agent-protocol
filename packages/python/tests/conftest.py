# SPDX-License-Identifier: Apache-2.0
"""
Pytest fixtures for MAP Protocol tests.
"""

import pytest

from mapprotocol.types import (
    AgentDescriptor,
    ApprovalRequest,
    DispatchRequest,
    ExecutionMode,
    ExecutionReceipt,
    RequesterIdentity,
    RequesterIdentityType,
    ResultPackage,
    RiskLevel,
    TaskConstraints,
    TaskEnvelope,
    TaskStatus,
    VisibilityMode,
)


@pytest.fixture
def sample_requester_identity():
    """Create a sample requester identity."""
    return RequesterIdentity(
        type=RequesterIdentityType.USER,
        id="user-123",
        tenant_id="tenant-456",
    )


@pytest.fixture
def sample_task_constraints():
    """Create a sample task constraints object."""
    return TaskConstraints(
        common={
            "max_amount": 1000,
            "environment": "development",
        },
        domain={"key": "value"},
    )


@pytest.fixture
def sample_task_constraints_dict():
    """Create a sample task constraints as plain dict for validation."""
    return {
        "common": {
            "max_amount": 1000,
            "environment": "development",
        },
        "domain": {"key": "value"},
    }


@pytest.fixture
def sample_task_envelope(sample_requester_identity, sample_task_constraints):
    """Create a sample task envelope."""
    return TaskEnvelope(
        task_id="task-abc-123",
        requester_identity=sample_requester_identity,
        target_agent="agent-payments",
        intent="Process a test payment",
        constraints=sample_task_constraints,
        risk_class=RiskLevel.MEDIUM,
        delegation_token="delegation-token-abc",
        requested_output_mode=VisibilityMode.FULL,
        metadata={"priority": "normal"},
    )


@pytest.fixture
def sample_task_envelope_dict(sample_requester_identity, sample_task_constraints_dict):
    """Create a sample task envelope as plain dict for validation."""
    return {
        "task_id": "task-abc-123",
        "requester_identity": {
            "type": "user",
            "id": "user-123",
            "tenant_id": "tenant-456",
        },
        "target_agent": "agent-payments",
        "intent": "Process a test payment",
        "constraints": sample_task_constraints_dict,
        "risk_class": "medium",
        "delegation_token": "delegation-token-abc",
        "requested_output_mode": "full",
        "metadata": {"priority": "normal"},
    }


@pytest.fixture
def sample_dispatch_request(sample_task_envelope):
    """Create a sample dispatch request."""
    return DispatchRequest(
        capability="payment",
        envelope=sample_task_envelope,
        requested_schema_version="1.0.0",
    )


@pytest.fixture
def sample_dispatch_request_dict(sample_task_envelope_dict):
    """Create a sample dispatch request as plain dict for validation."""
    return {
        "capability": "payment",
        "envelope": sample_task_envelope_dict,
        "requested_schema_version": "1.0.0",
    }


@pytest.fixture
def sample_approval_request(sample_task_envelope):
    """Create a sample approval request."""
    return ApprovalRequest(
        task_id="task-abc-123",
        approval_reference="approval-ref-1",
        capability="payment",
        envelope=sample_task_envelope,
    )


@pytest.fixture
def sample_approval_request_dict(sample_task_envelope_dict):
    """Create a sample approval request as plain dict for validation."""
    return {
        "task_id": "task-abc-123",
        "approval_reference": "approval-ref-1",
        "capability": "payment",
        "envelope": sample_task_envelope_dict,
    }


@pytest.fixture
def sample_agent_descriptor():
    """Create a sample agent descriptor."""
    return AgentDescriptor(
        agent_id="agent-payments",
        organization="test-org",
        version="1.0.0",
        domain="payments",
        capabilities=["payment", "refund"],
        risk_level=RiskLevel.MEDIUM,
        input_schema_ref="https://example.com/schemas/input.json",
        output_schema_ref="https://example.com/schemas/output.json",
        supported_execution_modes=[ExecutionMode.READ, ExecutionMode.COMMIT],
        visibility_modes=[VisibilityMode.FULL, VisibilityMode.SUMMARY],
    )


@pytest.fixture
def sample_result_package():
    """Create a sample result package."""
    return ResultPackage(
        task_id="task-abc-123",
        status=TaskStatus.COMPLETED,
        structured_output={"result": "success", "transaction_id": "txn-123"},
        followup_required=False,
        summary="Payment processed successfully",
    )


@pytest.fixture
def sample_result_package_dict():
    """Create a sample result package as plain dict for validation."""
    return {
        "task_id": "task-abc-123",
        "status": "completed",
        "structured_output": {"result": "success", "transaction_id": "txn-123"},
        "followup_required": False,
        "summary": "Payment processed successfully",
    }


@pytest.fixture
def sample_execution_receipt():
    """Create a sample execution receipt."""
    return ExecutionReceipt(
        receipt_id="receipt-1",
        task_id="task-abc-123",
        agent_id="agent-payments",
        action_taken="executed_payment",
        resource_touched="payment-123",
        policy_checks=["policy-1", "policy-2"],
        timestamp="2024-01-15T10:30:00Z",
        result_hash="abc123hash",
        signature="signature-xyz",
        tenant_id="tenant-456",
    )


@pytest.fixture
def sample_execution_receipt_dict():
    """Create a sample execution receipt as plain dict for validation."""
    return {
        "receipt_id": "receipt-1",
        "task_id": "task-abc-123",
        "agent_id": "agent-payments",
        "action_taken": "executed_payment",
        "resource_touched": "payment-123",
        "policy_checks": ["policy-1", "policy-2"],
        "timestamp": "2024-01-15T10:30:00Z",
        "result_hash": "abc123hash",
        "signature": "signature-xyz",
        "tenant_id": "tenant-456",
    }


@pytest.fixture
def sample_agent_descriptor_dict():
    """Create a sample agent descriptor as plain dict for validation."""
    return {
        "agent_id": "agent-payments",
        "organization": "test-org",
        "version": "1.0.0",
        "domain": "payments",
        "capabilities": ["payment", "refund"],
        "risk_level": "medium",
        "input_schema_ref": "https://example.com/schemas/input.json",
        "output_schema_ref": "https://example.com/schemas/output.json",
        "supported_execution_modes": ["read", "commit"],
        "visibility_modes": ["full", "summary"],
    }


@pytest.fixture
def mock_server():
    """
    Create a mock server fixture.

    In a real implementation, this would start a test server
    or use responses/httpx mock to simulate the API.
    """
    pass
