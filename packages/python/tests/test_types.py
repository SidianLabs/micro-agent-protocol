# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol types.
"""

import pytest

from mapprotocol.types import (
    ERROR_CODE_RETRYABLE_MAP,
    ERROR_CODE_STATUS_MAP,
    AgentDescriptor,
    ApprovalRequest,
    AuthScheme,
    CapabilityDescriptor,
    DeliveryMode,
    DispatchRequest,
    ErrorCode,
    ExecutionMode,
    ExecutionReceipt,
    InvokeResult,
    MapErrorResponse,
    PolicyDecision,
    RequesterIdentity,
    RequesterIdentityType,
    ResultPackage,
    RiskLevel,
    TaskConstraints,
    TaskEnvelope,
    TaskStatus,
    VisibilityMode,
)


class TestEnums:
    """Tests for enum types."""

    def test_risk_level_values(self):
        assert RiskLevel.LOW.value == "low"
        assert RiskLevel.MEDIUM.value == "medium"
        assert RiskLevel.HIGH.value == "high"
        assert RiskLevel.CRITICAL.value == "critical"

    def test_execution_mode_values(self):
        assert ExecutionMode.READ.value == "read"
        assert ExecutionMode.ANALYZE.value == "analyze"
        assert ExecutionMode.PROPOSE.value == "propose"
        assert ExecutionMode.COMMIT.value == "commit"
        assert ExecutionMode.MONITOR.value == "monitor"
        assert ExecutionMode.BATCH.value == "batch"

    def test_visibility_mode_values(self):
        assert VisibilityMode.FULL.value == "full"
        assert VisibilityMode.SUMMARY.value == "summary"
        assert VisibilityMode.STRUCTURED_ONLY.value == "structured_only"
        assert VisibilityMode.RECEIPT_ONLY.value == "receipt_only"
        assert VisibilityMode.REDACTED.value == "redacted"
        assert VisibilityMode.DEBUG.value == "debug"

    def test_delivery_mode_values(self):
        assert DeliveryMode.SYNC.value == "sync"
        assert DeliveryMode.ASYNC.value == "async"

    def test_task_status_values(self):
        assert TaskStatus.ACCEPTED.value == "accepted"
        assert TaskStatus.PROPOSED.value == "proposed"
        assert TaskStatus.AWAITING_APPROVAL.value == "awaiting_approval"
        assert TaskStatus.DENIED.value == "denied"
        assert TaskStatus.RUNNING.value == "running"
        assert TaskStatus.COMPLETED.value == "completed"
        assert TaskStatus.FAILED.value == "failed"
        assert TaskStatus.REVOKED.value == "revoked"

    def test_auth_scheme_values(self):
        assert AuthScheme.NONE.value == "none"
        assert AuthScheme.BEARER.value == "bearer"
        assert AuthScheme.MTLS.value == "mtls"
        assert AuthScheme.SIGNED_REQUEST.value == "signed_request"

    def test_error_code_values(self):
        assert ErrorCode.AGENT_NOT_FOUND.value == "agent_not_found"
        assert ErrorCode.POLICY_DENIED.value == "policy_denied"
        assert ErrorCode.INTERNAL_ERROR.value == "internal_error"

    def test_requester_identity_type_values(self):
        assert RequesterIdentityType.USER.value == "user"
        assert RequesterIdentityType.SERVICE.value == "service"
        assert RequesterIdentityType.AGENT.value == "agent"


class TestErrorCodeMaps:
    """Tests for error code mapping constants."""

    def test_error_code_status_map(self):
        assert ERROR_CODE_STATUS_MAP["agent_not_found"] == 404
        assert ERROR_CODE_STATUS_MAP["internal_error"] == 500
        assert ERROR_CODE_STATUS_MAP["rate_limit_exceeded"] == 429

    def test_error_code_retryable_map(self):
        assert ERROR_CODE_RETRYABLE_MAP["agent_not_found"] is False
        assert ERROR_CODE_RETRYABLE_MAP["internal_error"] is True
        assert ERROR_CODE_RETRYABLE_MAP["rate_limit_exceeded"] is True
        assert ERROR_CODE_RETRYABLE_MAP["resource_not_found"] is False


class TestRequesterIdentity:
    """Tests for RequesterIdentity dataclass."""

    def test_requester_identity_creation(self):
        identity = RequesterIdentity(
            type=RequesterIdentityType.USER, id="user-123", tenant_id="tenant-456"
        )
        assert identity.type == RequesterIdentityType.USER
        assert identity.id == "user-123"
        assert identity.tenant_id == "tenant-456"

    def test_requester_identity_optional_tenant(self):
        identity = RequesterIdentity(
            type=RequesterIdentityType.SERVICE, id="service-abc"
        )
        assert identity.type == RequesterIdentityType.SERVICE
        assert identity.id == "service-abc"
        assert identity.tenant_id is None


class TestTaskEnvelope:
    """Tests for TaskEnvelope dataclass."""

    def test_task_envelope_creation(self):
        identity = RequesterIdentity(type=RequesterIdentityType.USER, id="user-123")
        envelope = TaskEnvelope(
            task_id="task-1",
            requester_identity=identity,
            target_agent="agent-payments",
            intent="Process payment",
            constraints=TaskConstraints(common={"max_amount": 1000}),
            risk_class=RiskLevel.HIGH,
            delegation_token="delegation-token-abc",
            requested_output_mode=VisibilityMode.FULL,
        )
        assert envelope.task_id == "task-1"
        assert envelope.target_agent == "agent-payments"
        assert envelope.risk_class == RiskLevel.HIGH
        assert envelope.requested_output_mode == VisibilityMode.FULL


class TestAgentDescriptor:
    """Tests for AgentDescriptor dataclass."""

    def test_agent_descriptor_creation(self):
        descriptor = AgentDescriptor(
            agent_id="agent-1",
            organization="org-1",
            version="1.0.0",
            domain="payments",
            capabilities=["pay", "refund"],
            risk_level=RiskLevel.MEDIUM,
            input_schema_ref="input-schema",
            output_schema_ref="output-schema",
            supported_execution_modes=[ExecutionMode.READ, ExecutionMode.COMMIT],
            visibility_modes=[VisibilityMode.FULL, VisibilityMode.SUMMARY],
        )
        assert descriptor.agent_id == "agent-1"
        assert descriptor.domain == "payments"
        assert RiskLevel.MEDIUM in [descriptor.risk_level]


class TestCapabilityDescriptor:
    """Tests for CapabilityDescriptor dataclass."""

    def test_capability_descriptor_creation(self):
        cap = CapabilityDescriptor(
            name="payment",
            execution_mode=ExecutionMode.COMMIT,
            request_schema_ref="request-schema",
            response_schema_ref="response-schema",
        )
        assert cap.name == "payment"
        assert cap.execution_mode == ExecutionMode.COMMIT


class TestResultPackage:
    """Tests for ResultPackage dataclass."""

    def test_result_package_creation(self):
        result = ResultPackage(
            task_id="task-1",
            status=TaskStatus.COMPLETED,
            structured_output={"result": "success"},
            followup_required=False,
        )
        assert result.task_id == "task-1"
        assert result.status == TaskStatus.COMPLETED
        assert result.structured_output == {"result": "success"}
        assert result.followup_required is False


class TestExecutionReceipt:
    """Tests for ExecutionReceipt dataclass."""

    def test_execution_receipt_creation(self):
        receipt = ExecutionReceipt(
            receipt_id="receipt-1",
            task_id="task-1",
            agent_id="agent-1",
            action_taken="executed",
            resource_touched="payment-123",
            policy_checks=["check-1", "check-2"],
            timestamp="2024-01-01T00:00:00Z",
            result_hash="hash-abc",
            signature="sig-xyz",
        )
        assert receipt.receipt_id == "receipt-1"
        assert receipt.task_id == "task-1"
        assert len(receipt.policy_checks) == 2


class TestPolicyDecision:
    """Tests for PolicyDecision dataclass."""

    def test_policy_decision_creation(self):
        decision = PolicyDecision(
            allowed=True,
            action="allow",
            policy_checks=["check-1"],
        )
        assert decision.allowed is True
        assert decision.action == "allow"
