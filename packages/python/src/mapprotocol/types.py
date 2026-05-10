# SPDX-License-Identifier: Apache-2.0
"""
Type definitions for MAP Protocol.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class VisibilityMode(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    ENCRYPTED = "encrypted"


class ExecutionMode(str, Enum):
    SYNCHRONOUS = "synchronous"
    ASYNCHRONOUS = "asynchronous"
    BATCH = "batch"


class RequesterIdentityType(str, Enum):
    USER = "user"
    SERVICE = "service"
    ORGANIZATION = "organization"


@dataclass
class RequesterIdentity:
    type: RequesterIdentityType
    id: str
    name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class TaskConstraints:
    timeout_seconds: Optional[int] = None
    max_retries: Optional[int] = None
    risk_level: Optional[RiskLevel] = None
    visibility: VisibilityMode = VisibilityMode.PRIVATE
    execution_mode: ExecutionMode = ExecutionMode.SYNCHRONOUS
    tags: Optional[List[str]] = None


@dataclass
class TaskEnvelope:
    id: str
    requester: RequesterIdentity
    description: str
    constraints: TaskConstraints
    payload: Dict[str, Any]
    created_at: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class DelegationToken:
    token: str
    expires_at: str
    issuer: str
    audience: Optional[str] = None
    scopes: Optional[List[str]] = None


@dataclass
class InvokeResult:
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: Optional[int] = None


@dataclass
class ResultPackage:
    task_id: str
    status: TaskStatus
    result: Optional[InvokeResult] = None
    artifacts: Optional[Dict[str, Any]] = None
    completed_at: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ExecutionReceipt:
    task_id: str
    executed_by: str
    executed_at: str
    signature: Optional[str] = None
    verification_data: Optional[Dict[str, Any]] = None


@dataclass
class DispatchRequest:
    task: TaskEnvelope
    delegation_token: Optional[DelegationToken] = None
    callback_url: Optional[str] = None


@dataclass
class ApprovalRequest:
    task_id: str
    requester: RequesterIdentity
    risk_level: RiskLevel
    details: Dict[str, Any]
    requested_at: str


@dataclass
class AgentDescriptor:
    id: str
    name: str
    capabilities: List[str]
    description: Optional[str] = None
    endpoint: Optional[str] = None
    version: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class TaskRecord:
    id: str
    status: TaskStatus
    requester: RequesterIdentity
    description: str
    created_at: str
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
    result: Optional[ResultPackage] = None
    metadata: Optional[Dict[str, Any]] = None