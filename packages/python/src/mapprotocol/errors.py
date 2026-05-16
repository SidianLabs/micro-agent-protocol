# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# SPDX-License-Identifier: Apache-2.0
"""
Error classes for MAP Protocol SDK.
"""

from __future__ import annotations

from typing import Optional, Dict, Any


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


class MapError(Exception):
    """Base exception for all MAP Protocol errors."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class MapAPIError(MapError):
    """Exception for API-related errors."""

    def __init__(
        self,
        code: str,
        message: str,
        retryable: Optional[bool] = None,
        status: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, details)
        self.code = code
        self.status = status if status is not None else ERROR_CODE_STATUS_MAP.get(code, 500)
        self.retryable = retryable if retryable is not None else ERROR_CODE_RETRYABLE_MAP.get(code, False)


class MapValidationError(MapError):
    """Exception for validation errors."""

    def __init__(
        self,
        message: str,
        errors: Optional[list] = None,
        field: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message, details)
        self.field = field
        self.errors = errors or []


class MapSigningError(MapError):
    """Exception for signing-related errors."""

    pass


class MapTimeoutError(MapError):
    """Exception for timeout errors."""

    def __init__(self, message: str, timeout_seconds: Optional[int] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.timeout_seconds = timeout_seconds


class MapRetryableError(MapError):
    """Exception for retryable errors."""

    def __init__(self, message: str, retry_after_ms: Optional[int] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.retry_after_ms = retry_after_ms
