# SPDX-License-Identifier: Apache-2.0
"""
Validation utilities for MAP Protocol.

Uses jsonschema for JSON Schema validation based on the schemas
defined in ../../../schemas/
"""

from __future__ import annotations

import json
import pkgutil
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

try:
    import jsonschema
    from jsonschema import ValidationError as JsonSchemaValidationError
    from jsonschema import validate

    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False
    JsonSchemaValidationError = Exception


# Load schemas from package resources or use embedded schemas
def _load_schema(schema_name: str) -> Dict[str, Any]:
    """Load a JSON schema by name."""
    schema_map = {
        "task-envelope": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://map-spec.dev/schemas/task-envelope.schema.json",
            "title": "MAP Task Envelope",
            "type": "object",
            "additionalProperties": False,
            "required": [
                "task_id",
                "requester_identity",
                "target_agent",
                "intent",
                "constraints",
                "risk_class",
                "delegation_token",
                "requested_output_mode",
            ],
            "properties": {
                "task_id": {"type": "string", "minLength": 1},
                "parent_task_id": {"type": "string"},
                "requester_identity": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["type", "id"],
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["user", "service", "agent"],
                        },
                        "id": {"type": "string", "minLength": 1},
                        "tenant_id": {"type": "string", "minLength": 1},
                    },
                },
                "target_agent": {"type": "string", "minLength": 1},
                "intent": {"type": "string", "minLength": 1},
                "constraints": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "common": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "resource_id": {"type": "string"},
                                "resource_ids": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                                "environment": {
                                    "type": "string",
                                    "enum": ["development", "staging", "production"],
                                },
                                "max_amount": {"type": "number"},
                                "currency": {"type": "string"},
                                "limit": {"type": "integer", "minimum": 1},
                                "approval_required": {"type": "boolean"},
                                "time_window": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["start", "end"],
                                    "properties": {
                                        "start": {"type": "string"},
                                        "end": {"type": "string"},
                                    },
                                },
                                "redaction_level": {
                                    "type": "string",
                                    "enum": ["none", "basic", "strict"],
                                },
                            },
                        },
                        "domain": {"type": "object"},
                    },
                },
                "risk_class": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                },
                "deadline": {"type": "string"},
                "delegation_token": {"type": "string", "minLength": 1},
                "requested_output_mode": {
                    "type": "string",
                    "enum": [
                        "full",
                        "summary",
                        "structured_only",
                        "receipt_only",
                        "redacted",
                        "debug",
                    ],
                },
                "metadata": {"type": "object"},
            },
        },
        "dispatch-request": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://map-spec.dev/schemas/dispatch-request.schema.json",
            "title": "MAP Dispatch Request",
            "type": "object",
            "additionalProperties": False,
            "required": ["capability", "envelope"],
            "properties": {
                "capability": {"type": "string", "minLength": 1},
                "requested_schema_version": {"type": "string"},
                "negotiation": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "schema_version": {"type": "string"},
                        "delivery_mode": {"type": "string", "enum": ["sync", "async"]},
                    },
                },
                "envelope": {"$ref": "#/definitions/task-envelope"},
            },
        },
        "approval-request": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://map-spec.dev/schemas/approval-request.schema.json",
            "title": "MAP Approval Request",
            "type": "object",
            "additionalProperties": False,
            "required": ["task_id", "approval_reference", "capability", "envelope"],
            "properties": {
                "task_id": {"type": "string", "minLength": 1},
                "approval_reference": {"type": "string", "minLength": 1},
                "capability": {"type": "string", "minLength": 1},
                "requested_schema_version": {"type": "string"},
                "negotiation": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "schema_version": {"type": "string"},
                        "delivery_mode": {"type": "string", "enum": ["sync", "async"]},
                    },
                },
                "envelope": {"$ref": "#/definitions/task-envelope"},
            },
        },
        "agent-descriptor": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://map-spec.dev/schemas/agent-descriptor.schema.json",
            "title": "MAP Agent Descriptor",
            "type": "object",
            "additionalProperties": False,
            "required": [
                "agent_id",
                "organization",
                "version",
                "domain",
                "capabilities",
                "risk_level",
                "input_schema_ref",
                "output_schema_ref",
                "supported_execution_modes",
                "visibility_modes",
            ],
            "properties": {
                "agent_id": {"type": "string", "minLength": 1},
                "organization": {"type": "string", "minLength": 1},
                "version": {"type": "string"},
                "domain": {"type": "string", "minLength": 1},
                "capabilities": {
                    "type": "array",
                    "minItems": 1,
                    "items": {"type": "string", "minLength": 1},
                },
                "risk_level": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                },
                "input_schema_ref": {"type": "string", "minLength": 1},
                "output_schema_ref": {"type": "string", "minLength": 1},
                "supported_execution_modes": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "string",
                        "enum": [
                            "read",
                            "analyze",
                            "propose",
                            "commit",
                            "monitor",
                            "batch",
                        ],
                    },
                },
                "visibility_modes": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "string",
                        "enum": [
                            "full",
                            "summary",
                            "structured_only",
                            "receipt_only",
                            "redacted",
                            "debug",
                        ],
                    },
                },
                "description": {"type": "string"},
            },
        },
        "execution-receipt": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://map-spec.dev/schemas/execution-receipt.schema.json",
            "title": "MAP Execution Receipt",
            "type": "object",
            "additionalProperties": False,
            "required": [
                "receipt_id",
                "task_id",
                "agent_id",
                "action_taken",
                "resource_touched",
                "policy_checks",
                "timestamp",
                "result_hash",
                "signature",
            ],
            "properties": {
                "receipt_id": {"type": "string", "minLength": 1},
                "task_id": {"type": "string", "minLength": 1},
                "tenant_id": {"type": "string", "minLength": 1},
                "request_id": {"type": "string", "minLength": 1},
                "agent_id": {"type": "string", "minLength": 1},
                "action_taken": {"type": "string", "minLength": 1},
                "resource_touched": {"type": "string", "minLength": 1},
                "policy_checks": {"type": "array", "items": {"type": "string"}},
                "approval_used": {"type": "string"},
                "timestamp": {"type": "string"},
                "result_hash": {"type": "string", "minLength": 1},
                "requested_schema_version": {"type": "string"},
                "executed_schema_version": {"type": "string"},
                "signature": {"type": "string", "minLength": 1},
            },
        },
        "result-package": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://map-spec.dev/schemas/result-package.schema.json",
            "title": "MAP Result Package",
            "type": "object",
            "additionalProperties": False,
            "required": ["task_id", "status", "structured_output", "followup_required"],
            "properties": {
                "task_id": {"type": "string", "minLength": 1},
                "status": {
                    "type": "string",
                    "enum": [
                        "accepted",
                        "proposed",
                        "awaiting_approval",
                        "denied",
                        "running",
                        "completed",
                        "failed",
                        "revoked",
                    ],
                },
                "summary": {"type": "string"},
                "structured_output": {"type": "object"},
                "receipt_ref": {"type": "string"},
                "negotiated_schema_version": {"type": "string"},
                "requested_schema_version": {"type": "string"},
                "executed_schema_version": {"type": "string"},
                "redactions_applied": {"type": "array", "items": {"type": "string"}},
                "followup_required": {"type": "boolean"},
                "escalation_reason": {"type": "string"},
            },
        },
    }

    # Add task-envelope as a definition for refs
    schema_map["dispatch-request"]["definitions"] = {
        "task-envelope": schema_map["task-envelope"]
    }
    schema_map["approval-request"]["definitions"] = {
        "task-envelope": schema_map["task-envelope"]
    }

    return schema_map.get(schema_name, {})


@dataclass
class ValidationErrorDetail:
    """Detail for a single validation error."""

    field: str
    message: str
    code: str
    context: Optional[Dict[str, Any]] = None


class ValidationError(Exception):
    """Exception raised when validation fails."""

    def __init__(self, errors: str | List[ValidationErrorDetail]):
        if isinstance(errors, str):
            # Handle simple string message
            self.errors = [
                ValidationErrorDetail(field="", message=errors, code="validation_error")
            ]
        else:
            self.errors = errors
        super().__init__(
            f"Validation failed: {', '.join(e.message for e in self.errors)}"
        )


def validate_task_envelope(input_data: Any) -> None:
    """
    Validate a task envelope.

    Args:
        input_data: The task envelope data to validate.

    Raises:
        ValidationError: If validation fails.
    """
    if not HAS_JSONSCHEMA:
        # Fallback to basic validation if jsonschema not available
        _validate_task_envelope_basic(input_data)
        return

    schema = _load_schema("task-envelope")
    try:
        validate(instance=input_data, schema=schema)
    except JsonSchemaValidationError as e:
        errors = _parse_json_schema_errors(e, "task_envelope")
        raise ValidationError(errors)


def validate_dispatch_request(input_data: Any) -> None:
    """
    Validate a dispatch request.

    Args:
        input_data: The dispatch request data to validate.

    Raises:
        ValidationError: If validation fails.
    """
    if not HAS_JSONSCHEMA:
        _validate_dispatch_request_basic(input_data)
        return

    schema = _load_schema("dispatch-request")
    try:
        validate(instance=input_data, schema=schema)
    except JsonSchemaValidationError as e:
        errors = _parse_json_schema_errors(e, "dispatch_request")
        raise ValidationError(errors)


def validate_approval_request(input_data: Any) -> None:
    """
    Validate an approval request.

    Args:
        input_data: The approval request data to validate.

    Raises:
        ValidationError: If validation fails.
    """
    if not HAS_JSONSCHEMA:
        _validate_approval_request_basic(input_data)
        return

    schema = _load_schema("approval-request")
    try:
        validate(instance=input_data, schema=schema)
    except JsonSchemaValidationError as e:
        errors = _parse_json_schema_errors(e, "approval_request")
        raise ValidationError(errors)


def validate_agent_descriptor(input_data: Any) -> None:
    """
    Validate an agent descriptor.

    Args:
        input_data: The agent descriptor data to validate.

    Raises:
        ValidationError: If validation fails.
    """
    if not HAS_JSONSCHEMA:
        _validate_agent_descriptor_basic(input_data)
        return

    schema = _load_schema("agent-descriptor")
    try:
        validate(instance=input_data, schema=schema)
    except JsonSchemaValidationError as e:
        errors = _parse_json_schema_errors(e, "agent_descriptor")
        raise ValidationError(errors)


def validate_execution_receipt(input_data: Any) -> None:
    """
    Validate an execution receipt.

    Args:
        input_data: The execution receipt data to validate.

    Raises:
        ValidationError: If validation fails.
    """
    if not HAS_JSONSCHEMA:
        _validate_execution_receipt_basic(input_data)
        return

    schema = _load_schema("execution-receipt")
    try:
        validate(instance=input_data, schema=schema)
    except JsonSchemaValidationError as e:
        errors = _parse_json_schema_errors(e, "execution_receipt")
        raise ValidationError(errors)


def validate_result_package(input_data: Any) -> None:
    """
    Validate a result package.

    Args:
        input_data: The result package data to validate.

    Raises:
        ValidationError: If validation fails.
    """
    if not HAS_JSONSCHEMA:
        _validate_result_package_basic(input_data)
        return

    schema = _load_schema("result-package")
    try:
        validate(instance=input_data, schema=schema)
    except JsonSchemaValidationError as e:
        errors = _parse_json_schema_errors(e, "result_package")
        raise ValidationError(errors)


def _parse_json_schema_errors(
    exc: JsonSchemaValidationError, code_prefix: str
) -> List[ValidationErrorDetail]:
    """Parse jsonschema ValidationError into our ValidationErrorDetail format."""
    errors = []
    for error in exc.absolute_path:
        field = str(error) if error else "root"
        errors.append(
            ValidationErrorDetail(
                field=field,
                message=exc.message,
                code=f"{code_prefix}_validation_failed",
                context={"schema_path": str(exc.absolute_path)},
            )
        )
    if not errors:
        errors.append(
            ValidationErrorDetail(
                field="root",
                message=exc.message,
                code=f"{code_prefix}_validation_failed",
            )
        )
    return errors


# Basic validation fallbacks when jsonschema is not available
def _validate_task_envelope_basic(input_data: Any) -> None:
    """Basic validation for task envelope without jsonschema."""
    if not isinstance(input_data, dict):
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="root",
                    message="Task envelope must be an object",
                    code="task_envelope_validation_failed",
                )
            ]
        )

    required_fields = [
        "task_id",
        "requester_identity",
        "target_agent",
        "intent",
        "constraints",
        "risk_class",
        "delegation_token",
        "requested_output_mode",
    ]
    errors = []
    for field in required_fields:
        if field not in input_data:
            errors.append(
                ValidationErrorDetail(
                    field=field,
                    message=f"Missing required field: {field}",
                    code="task_envelope_validation_failed",
                )
            )
    if errors:
        raise ValidationError(errors)


def _validate_dispatch_request_basic(input_data: Any) -> None:
    """Basic validation for dispatch request without jsonschema."""
    if not isinstance(input_data, dict):
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="root",
                    message="Dispatch request must be an object",
                    code="dispatch_request_validation_failed",
                )
            ]
        )

    if "capability" not in input_data:
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="capability",
                    message="Missing required field: capability",
                    code="dispatch_request_validation_failed",
                )
            ]
        )
    if "envelope" not in input_data:
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="envelope",
                    message="Missing required field: envelope",
                    code="dispatch_request_validation_failed",
                )
            ]
        )


def _validate_approval_request_basic(input_data: Any) -> None:
    """Basic validation for approval request without jsonschema."""
    if not isinstance(input_data, dict):
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="root",
                    message="Approval request must be an object",
                    code="approval_request_validation_failed",
                )
            ]
        )

    required_fields = ["task_id", "approval_reference", "capability", "envelope"]
    errors = []
    for field in required_fields:
        if field not in input_data:
            errors.append(
                ValidationErrorDetail(
                    field=field,
                    message=f"Missing required field: {field}",
                    code="approval_request_validation_failed",
                )
            )
    if errors:
        raise ValidationError(errors)


def _validate_agent_descriptor_basic(input_data: Any) -> None:
    """Basic validation for agent descriptor without jsonschema."""
    if not isinstance(input_data, dict):
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="root",
                    message="Agent descriptor must be an object",
                    code="agent_descriptor_validation_failed",
                )
            ]
        )

    required_fields = [
        "agent_id",
        "organization",
        "version",
        "domain",
        "capabilities",
        "risk_level",
        "input_schema_ref",
        "output_schema_ref",
        "supported_execution_modes",
        "visibility_modes",
    ]
    errors = []
    for field in required_fields:
        if field not in input_data:
            errors.append(
                ValidationErrorDetail(
                    field=field,
                    message=f"Missing required field: {field}",
                    code="agent_descriptor_validation_failed",
                )
            )
    if errors:
        raise ValidationError(errors)


def _validate_execution_receipt_basic(input_data: Any) -> None:
    """Basic validation for execution receipt without jsonschema."""
    if not isinstance(input_data, dict):
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="root",
                    message="Execution receipt must be an object",
                    code="execution_receipt_validation_failed",
                )
            ]
        )

    required_fields = [
        "receipt_id",
        "task_id",
        "agent_id",
        "action_taken",
        "resource_touched",
        "policy_checks",
        "timestamp",
        "result_hash",
        "signature",
    ]
    errors = []
    for field in required_fields:
        if field not in input_data:
            errors.append(
                ValidationErrorDetail(
                    field=field,
                    message=f"Missing required field: {field}",
                    code="execution_receipt_validation_failed",
                )
            )
    if errors:
        raise ValidationError(errors)


def _validate_result_package_basic(input_data: Any) -> None:
    """Basic validation for result package without jsonschema."""
    if not isinstance(input_data, dict):
        raise ValidationError(
            [
                ValidationErrorDetail(
                    field="root",
                    message="Result package must be an object",
                    code="result_package_validation_failed",
                )
            ]
        )

    required_fields = ["task_id", "status", "structured_output", "followup_required"]
    errors = []
    for field in required_fields:
        if field not in input_data:
            errors.append(
                ValidationErrorDetail(
                    field=field,
                    message=f"Missing required field: {field}",
                    code="result_package_validation_failed",
                )
            )
    if errors:
        raise ValidationError(errors)
