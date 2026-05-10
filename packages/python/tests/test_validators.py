# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol validators.
"""

import pytest

from mapprotocol.types import (
    AgentDescriptor,
    ApprovalRequest,
    DispatchRequest,
    ExecutionMode,
    RequesterIdentity,
    RequesterIdentityType,
    RiskLevel,
    TaskConstraints,
    TaskEnvelope,
    VisibilityMode,
)
from mapprotocol.validators import (
    ValidationError,
    validate_agent_descriptor,
    validate_approval_request,
    validate_dispatch_request,
    validate_execution_receipt,
    validate_result_package,
    validate_task_envelope,
)


class TestValidateTaskEnvelope:
    """Tests for validate_task_envelope function."""

    def test_valid_task_envelope(self, sample_task_envelope_dict):
        """Test validation of a valid task envelope."""
        # Should not raise
        validate_task_envelope(sample_task_envelope_dict)

    def test_invalid_task_envelope(self):
        """Test validation of an invalid task envelope."""
        with pytest.raises(ValidationError):
            validate_task_envelope(None)


class TestValidateDispatchRequest:
    """Tests for validate_dispatch_request function."""

    def test_valid_dispatch_request(self, sample_dispatch_request_dict):
        """Test validation of a valid dispatch request."""
        # Should not raise
        validate_dispatch_request(sample_dispatch_request_dict)

    def test_invalid_dispatch_request(self):
        """Test validation of an invalid dispatch request."""
        with pytest.raises(ValidationError):
            validate_dispatch_request(None)


class TestValidateApprovalRequest:
    """Tests for validate_approval_request function."""

    def test_valid_approval_request(self, sample_approval_request_dict):
        """Test validation of a valid approval request."""
        # Should not raise
        validate_approval_request(sample_approval_request_dict)

    def test_invalid_approval_request(self):
        """Test validation of an invalid approval request."""
        with pytest.raises(ValidationError):
            validate_approval_request(None)


class TestValidateAgentDescriptor:
    """Tests for validate_agent_descriptor function."""

    def test_valid_agent_descriptor(self, sample_agent_descriptor_dict):
        """Test validation of a valid agent descriptor."""
        # Should not raise
        validate_agent_descriptor(sample_agent_descriptor_dict)

    def test_invalid_agent_descriptor(self):
        """Test validation of an invalid agent descriptor."""
        with pytest.raises(ValidationError):
            validate_agent_descriptor(None)


class TestValidateExecutionReceipt:
    """Tests for validate_execution_receipt function."""

    def test_valid_execution_receipt(self, sample_execution_receipt_dict):
        """Test validation of a valid execution receipt."""
        # Should not raise
        validate_execution_receipt(sample_execution_receipt_dict)

    def test_invalid_execution_receipt(self):
        """Test validation of an invalid execution receipt."""
        with pytest.raises(ValidationError):
            validate_execution_receipt(None)


class TestValidateResultPackage:
    """Tests for validate_result_package function."""

    def test_valid_result_package(self, sample_result_package_dict):
        """Test validation of a valid result package."""
        # Should not raise
        validate_result_package(sample_result_package_dict)

    def test_invalid_result_package(self):
        """Test validation of an invalid result package."""
        with pytest.raises(ValidationError):
            validate_result_package(None)


class TestValidationError:
    """Tests for ValidationError exception."""

    def test_validation_error_message(self):
        """Test ValidationError can be created with a message."""
        error = ValidationError("Test validation error")
        assert "Test validation error" in str(error)

    def test_validation_error_with_field(self):
        """Test ValidationError can include field info."""
        error = ValidationError("Field 'name' is required")
        assert "name" in str(error).lower() or "required" in str(error).lower()
