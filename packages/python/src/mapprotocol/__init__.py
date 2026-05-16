# SPDX-License-Identifier: Apache-2.0
"""
MAP Protocol Python SDK

Official Python SDK for Micro Agent Protocol (MAP)
"""

from mapprotocol.client import AsyncMapAssistantClient, MapAssistantClient
from mapprotocol.errors import (
    ERROR_CODE_RETRYABLE_MAP,
    ERROR_CODE_STATUS_MAP,
    MapAPIError,
    MapError,
    MapRetryableError,
    MapSigningError,
    MapTimeoutError,
    MapValidationError,
)
from mapprotocol.logger import (
    LogEntry,
    LogLevel,
    MAPLogger,
    MetricsCollector,
    ObservabilityManager,
    Tracer,
    latency_tracker,
)
from mapprotocol.policy import (
    PolicyCondition,
    PolicyContext,
    PolicyEffect,
    PolicyEngine,
    PolicyResult,
    PolicyRule,
    create_risk_based_policy,
    evaluate_task_constraints,
)
from mapprotocol.signing import (
    HMACSigner,
    RSASigner,
    create_signer,
)
from mapprotocol.signing_http import HTTPSigner
from mapprotocol.storage import (
    FileReceiptStoreAdapter,
    FileStorage,
    FileTaskStoreAdapter,
    InMemoryStorage,
    ReceiptStoreAdapter,
    SQLiteStorage,
    TaskStoreAdapter,
)
from mapprotocol.types import (
    ERROR_CODE_RETRYABLE_MAP,
    # Error code constants
    ERROR_CODE_STATUS_MAP,
    AgentDescriptor,
    ApprovalRequest,
    AuthScheme,
    CapabilityDescriptor,
    DelegationToken,
    DeliveryMode,
    DispatchRequest,
    ErrorCode,
    ExecutionMode,
    ExecutionReceipt,
    HealthStatus,
    InvokeResult,
    MapErrorResponse,
    PaginatedResult,
    PolicyDecision,
    # Interfaces
    RequesterIdentity,
    RequesterIdentityType,
    ResultPackage,
    # Enums
    RiskLevel,
    TaskConstraints,
    TaskEnvelope,
    TaskRecord,
    TaskStatus,
    VersionInfo,
    VisibilityMode,
)
from mapprotocol.validators import (
    validate_agent_descriptor,
    validate_approval_request,
    validate_dispatch_request,
    validate_execution_receipt,
    validate_result_package,
    validate_task_envelope,
)
from mapprotocol.webhooks import (
    WebhookDeliveryResult,
    WebhookEvent,
    WebhookEventType,
    WebhookSender,
    create_webhook_event,
    verify_webhook_signature,
)

__version__ = "1.0.0"
__all__ = [
    # Client
    "MapAssistantClient",
    "AsyncMapAssistantClient",
    # Errors
    "MapError",
    "MapAPIError",
    "MapValidationError",
    "MapSigningError",
    "MapTimeoutError",
    "MapRetryableError",
    "ERROR_CODE_STATUS_MAP",
    "ERROR_CODE_RETRYABLE_MAP",
    # Types - Enums
    "RiskLevel",
    "ExecutionMode",
    "VisibilityMode",
    "DeliveryMode",
    "TaskStatus",
    "AuthScheme",
    "ErrorCode",
    "RequesterIdentityType",
    # Types - Interfaces
    "RequesterIdentity",
    "TaskConstraints",
    "AgentDescriptor",
    "CapabilityDescriptor",
    "TaskEnvelope",
    "DelegationToken",
    "DispatchRequest",
    "ApprovalRequest",
    "ResultPackage",
    "ExecutionReceipt",
    "InvokeResult",
    "PolicyDecision",
    "MapErrorResponse",
    "PaginatedResult",
    "HealthStatus",
    "VersionInfo",
    "TaskRecord",
    # Signing
    "HMACSigner",
    "RSASigner",
    "HTTPSigner",
    "create_signer",
    # Storage
    "InMemoryStorage",
    "FileStorage",
    "SQLiteStorage",
    "TaskStoreAdapter",
    "ReceiptStoreAdapter",
    "FileTaskStoreAdapter",
    "FileReceiptStoreAdapter",
    # Validators
    "validate_task_envelope",
    "validate_dispatch_request",
    "validate_approval_request",
    "validate_agent_descriptor",
    "validate_execution_receipt",
    "validate_result_package",
    # Policy
    "PolicyEngine",
    "PolicyEffect",
    "PolicyResult",
    "PolicyRule",
    "PolicyCondition",
    "PolicyContext",
    "create_risk_based_policy",
    "evaluate_task_constraints",
    # Observability
    "MAPLogger",
    "LogLevel",
    "LogEntry",
    "MetricsCollector",
    "Tracer",
    "ObservabilityManager",
    "latency_tracker",
    # Webhooks
    "WebhookSender",
    "WebhookEvent",
    "WebhookEventType",
    "WebhookDeliveryResult",
    "create_webhook_event",
    "verify_webhook_signature",
]
