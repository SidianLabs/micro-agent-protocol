# SPDX-License-Identifier: Apache-2.0
"""
Type definitions for MAP Protocol.

These types mirror the TypeScript SDK types defined in
protocol/map-types.ts for full type parity.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ExecutionMode(str, Enum):
    READ = "read"
    ANALYZE = "analyze"
    PROPOSE = "propose"
    COMMIT = "commit"
    MONITOR = "monitor"
    BATCH = "batch"


class VisibilityMode(str, Enum):
    FULL = "full"
    SUMMARY = "summary"
    STRUCTURED_ONLY = "structured_only"
    RECEIPT_ONLY = "receipt_only"
    REDACTED = "redacted"
    DEBUG = "debug"


class DeliveryMode(str, Enum):
    SYNC = "sync"
    ASYNC = "async"


class TaskStatus(str, Enum):
    ACCEPTED = "accepted"
    PROPOSED = "proposed"
    AWAITING_APPROVAL = "awaiting_approval"
    DENIED = "denied"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    REVOKED = "revoked"


class AuthScheme(str, Enum):
    NONE = "none"
    BEARER = "bearer"
    MTLS = "mtls"
    SIGNED_REQUEST = "signed_request"


class ErrorCode(str, Enum):
    AGENT_NOT_FOUND = "agent_not_found"
    AGENT_DISABLED = "agent_disabled"
    CAPABILITY_NOT_FOUND = "capability_not_found"
    CAPABILITY_DISABLED = "capability_disabled"
    POLICY_DENIED = "policy_denied"
    APPROVAL_REQUIRED = "approval_required"
    APPROVAL_DENIED = "approval_denied"
    APPROVAL_EXPIRED = "approval_expired"
    INVALID_DELEGATION_TOKEN = "invalid_delegation_token"
    TOKEN_EXPIRED = "token_expired"
    TOKEN_INVALID_SIGNATURE = "token_invalid_signature"
    TOKEN_MISSING_SCOPE = "token_missing_scope"
    SCHEMA_VALIDATION_FAILED = "schema_validation_failed"
    SCHEMA_VERSION_UNSUPPORTED = "schema_version_unsupported"
    SCHEMA_NEGOTIATION_FAILED = "schema_negotiation_failed"
    TENANT_MISMATCH = "tenant_mismatch"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    REQUEST_TIMEOUT = "request_timeout"
    INTERNAL_ERROR = "internal_error"
    INVALID_REQUEST = "invalid_request"
    IDEMPOTENCY_CONFLICT = "idempotency_conflict"
    RESOURCE_NOT_FOUND = "resource_not_found"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"


class RequesterIdentityType(str, Enum):
    USER = "user"
    SERVICE = "service"
    AGENT = "agent"


ERROR_CODE_STATUS_MAP: Dict[str, int] = {
    "agent_not_found": 404,
    "agent_disabled": 403,
    "capability_not_found": 404,
    "capability_disabled": 403,
    "policy_denied": 403,
    "approval_required": 202,
    "approval_denied": 403,
    "approval_expired": 410,
    "invalid_delegation_token": 401,
    "token_expired": 401,
    "token_invalid_signature": 401,
    "token_missing_scope": 403,
    "schema_validation_failed": 400,
    "schema_version_unsupported": 400,
    "schema_negotiation_failed": 400,
    "tenant_mismatch": 400,
    "rate_limit_exceeded": 429,
    "request_timeout": 408,
    "internal_error": 500,
    "invalid_request": 400,
    "idempotency_conflict": 409,
    "resource_not_found": 404,
    "unauthorized": 401,
    "forbidden": 403,
}


ERROR_CODE_RETRYABLE_MAP: Dict[str, bool] = {
    "agent_not_found": False,
    "agent_disabled": False,
    "capability_not_found": False,
    "capability_disabled": False,
    "policy_denied": False,
    "approval_required": False,
    "approval_denied": False,
    "approval_expired": False,
    "invalid_delegation_token": False,
    "token_expired": False,
    "token_invalid_signature": False,
    "token_missing_scope": False,
    "schema_validation_failed": False,
    "schema_version_unsupported": False,
    "schema_negotiation_failed": False,
    "tenant_mismatch": False,
    "rate_limit_exceeded": True,
    "request_timeout": True,
    "internal_error": True,
    "invalid_request": False,
    "idempotency_conflict": False,
    "resource_not_found": False,
    "unauthorized": True,
    "forbidden": False,
}


@dataclass
class RequesterIdentity:
    """Identity of the requester making a task request."""

    type: RequesterIdentityType
    id: str
    tenant_id: Optional[str] = None


@dataclass
class TimeWindow:
    """Time window constraint."""

    start: str
    end: str


@dataclass
class TaskConstraintsCommon:
    """Common task constraint properties."""

    resource_id: Optional[str] = None
    resource_ids: Optional[List[str]] = None
    environment: Optional[str] = None  # "development" | "staging" | "production"
    max_amount: Optional[float] = None
    currency: Optional[str] = None
    limit: Optional[int] = None
    approval_required: Optional[bool] = None
    time_window: Optional[TimeWindow] = None
    redaction_level: Optional[str] = None  # "none" | "basic" | "strict"


@dataclass
class TaskConstraints:
    """Task constraints defining execution boundaries."""

    common: Optional[Dict[str, Any]] = None
    domain: Optional[Dict[str, Any]] = None


@dataclass
class CapabilityDescriptor:
    """Descriptor for a specific capability of an agent."""

    name: str
    execution_mode: ExecutionMode
    request_schema_ref: str
    response_schema_ref: str
    constraint_schema_ref: Optional[str] = None
    approval_required_by_default: Optional[bool] = None
    auth_schemes: Optional[List[AuthScheme]] = None
    required_auth_scheme: Optional[AuthScheme] = None
    schema_version: Optional[str] = None
    supported_schema_versions: Optional[List[str]] = None
    preferred_schema_version: Optional[str] = None
    translation_targets: Optional[List[Dict[str, Any]]] = None
    compatibility: Optional[str] = (
        None  # "backward_compatible" | "forward_compatible" | "breaking_change"
    )
    status: Optional[str] = None  # "active" | "deprecated" | "disabled"


@dataclass
class AgentDescriptor:
    """Descriptor for an agent and its capabilities."""

    agent_id: str
    organization: str
    version: str
    domain: str
    capabilities: List[str]
    risk_level: RiskLevel
    input_schema_ref: str
    output_schema_ref: str
    supported_execution_modes: List[ExecutionMode]
    visibility_modes: List[VisibilityMode]
    approval_requirements: Optional[List[str]] = None
    policy_hooks: Optional[List[str]] = None
    display_name: Optional[str] = None
    provider_url: Optional[str] = None
    documentation_url: Optional[str] = None
    auth_schemes: Optional[List[AuthScheme]] = None
    capability_descriptors: Optional[List[CapabilityDescriptor]] = None
    transport_bindings: Optional[List[Dict[str, Any]]] = None
    tags: Optional[List[str]] = None
    registry_status: Optional[str] = None  # "active" | "deprecated" | "disabled"
    description: Optional[str] = None
    descriptor_signature: Optional[str] = None
    descriptor_key_id: Optional[str] = None
    descriptor_signature_alg: Optional[str] = None  # "HS256" | "RS256"


@dataclass
class TaskEnvelope:
    """Task envelope containing all task details."""

    task_id: str
    requester_identity: RequesterIdentity
    target_agent: str
    intent: str
    constraints: TaskConstraints
    risk_class: RiskLevel
    delegation_token: str
    requested_output_mode: VisibilityMode
    parent_task_id: Optional[str] = None
    deadline: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class DelegationToken:
    """Token delegating authority to execute tasks."""

    issuer: str
    subject_agent: str
    allowed_actions: List[str]
    resource_scope: Dict[str, Any]
    constraints: Dict[str, Any]
    signature: str
    approval_reference: Optional[str] = None
    requester_identity: Optional[RequesterIdentity] = None


@dataclass
class InvocationNegotiation:
    """Negotiation details for task invocation."""

    requested: Dict[str, Any]
    selected: Dict[str, Any]
    provider_actions: Optional[List[str]] = None


@dataclass
class DispatchRequest:
    """Request to dispatch a task for execution."""

    capability: str
    envelope: TaskEnvelope
    requested_schema_version: Optional[str] = None
    negotiation: Optional[InvocationNegotiation] = None


@dataclass
class ApprovalRequest:
    """Request for human approval of a task."""

    task_id: str
    approval_reference: str
    capability: str
    envelope: TaskEnvelope
    requested_schema_version: Optional[str] = None
    negotiation: Optional[InvocationNegotiation] = None


@dataclass
class ResultPackage:
    """Result of task execution."""

    task_id: str
    status: TaskStatus
    structured_output: Dict[str, Any]
    followup_required: bool
    summary: Optional[str] = None
    receipt_ref: Optional[str] = None
    negotiated_schema_version: Optional[str] = None
    requested_schema_version: Optional[str] = None
    executed_schema_version: Optional[str] = None
    negotiation: Optional[InvocationNegotiation] = None
    redactions_applied: Optional[List[str]] = None
    escalation_reason: Optional[str] = None


@dataclass
class ExecutionReceipt:
    """Receipt confirming task execution."""

    receipt_id: str
    task_id: str
    agent_id: str
    action_taken: str
    resource_touched: str
    policy_checks: List[str]
    timestamp: str
    result_hash: str
    signature: str
    tenant_id: Optional[str] = None
    request_id: Optional[str] = None
    approval_used: Optional[str] = None
    requested_schema_version: Optional[str] = None
    executed_schema_version: Optional[str] = None
    negotiation: Optional[InvocationNegotiation] = None


@dataclass
class InvokeResult:
    """Result of an invocation including package and receipt."""

    result: ResultPackage
    receipt: ExecutionReceipt


@dataclass
class PolicyDecision:
    """Decision from policy evaluation."""

    allowed: bool
    action: str  # "allow" | "deny" | "require_approval"
    policy_checks: List[str]
    reason: Optional[str] = None
    approval_reference: Optional[str] = None
    scoped_constraints: Optional[Dict[str, Any]] = None


@dataclass
class MapErrorResponse:
    """Error response from MAP Protocol API."""

    code: ErrorCode
    message: str
    retryable: bool
    status: int
    details: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None


@dataclass
class PaginatedResult:
    """Paginated list result."""

    items: List[Any]
    pagination: Dict[str, Any]


@dataclass
class VersionInfo:
    """Version information."""

    protocol: str
    schema: str
    transport: str


@dataclass
class HealthStatus:
    """Health status of the MAP Protocol service."""

    status: str  # "healthy" | "degraded" | "unhealthy"
    version: VersionInfo
    uptime_ms: int
    checks: Dict[str, Any]


@dataclass
class TaskRecord:
    """Complete task record with result and receipt."""

    task_id: str
    requester_identity: RequesterIdentity
    target_agent: str
    status: TaskStatus
    capability: str
    updated_at: str
    idempotency_key: Optional[str] = None
    result: Optional[ResultPackage] = None
    receipt: Optional[ExecutionReceipt] = None
