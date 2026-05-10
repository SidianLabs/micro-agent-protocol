# SPDX-License-Identifier: Apache-2.0
"""
MAP Protocol Python SDK

Official Python SDK for Micro Agent Protocol (MAP)
"""

from mapprotocol.types import (
    RiskLevel,
    TaskStatus,
    VisibilityMode,
    ExecutionMode,
    RequesterIdentityType,
    RequesterIdentity,
    TaskConstraints,
    TaskEnvelope,
    DelegationToken,
    ResultPackage,
    ExecutionReceipt,
    InvokeResult,
    DispatchRequest,
    ApprovalRequest,
    AgentDescriptor,
    TaskRecord,
)

from mapprotocol.errors import (
    MapError,
    MapAPIError,
    MapValidationError,
    MapSigningError,
    MapTimeoutError,
    MapRetryableError,
    ERROR_CODE_STATUS_MAP,
    ERROR_CODE_RETRYABLE_MAP,
)

from mapprotocol.client import MapAssistantClient, AsyncMapAssistantClient

from mapprotocol.storage import (
    TaskStoreAdapter,
    FileTaskStoreAdapter,
    ReceiptStoreAdapter,
    FileReceiptStoreAdapter,
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
    "TaskStatus",
    "VisibilityMode",
    "ExecutionMode",
    "RequesterIdentityType",
    # Types - Dataclasses
    "RequesterIdentity",
    "TaskConstraints",
    "TaskEnvelope",
    "DelegationToken",
    "ResultPackage",
    "ExecutionReceipt",
    "InvokeResult",
    "DispatchRequest",
    "ApprovalRequest",
    "AgentDescriptor",
    "TaskRecord",
    # Storage
    "TaskStoreAdapter",
    "FileTaskStoreAdapter",
    "ReceiptStoreAdapter",
    "FileReceiptStoreAdapter",
]
