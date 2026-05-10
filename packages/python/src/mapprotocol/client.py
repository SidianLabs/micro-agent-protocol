# SPDX-License-Identifier: Apache-2.0
"""
Main client for MAP Protocol.
"""

from __future__ import annotations

import json
import time
import random
from typing import Optional, List, Dict, Any, TypeVar, Type

from mapprotocol.transport import HTTPTransport, AsyncHTTPTransport
from mapprotocol.signing import HMACSigner, create_signer
from mapprotocol.types import (
    DispatchRequest,
    ApprovalRequest,
    TaskRecord,
    ResultPackage,
    AgentDescriptor,
    TaskEnvelope,
)
from mapprotocol.errors import (
    MapAPIError,
    MapValidationError,
    MapTimeoutError,
    MapRetryableError,
    ERROR_CODE_RETRYABLE_MAP,
)

T = TypeVar('T')


def _decode_json(content: bytes, cls: Type[T]) -> T:
    """Decode JSON content to a type."""
    data = json.loads(content)
    if isinstance(data, dict):
        return cls(**data)
    elif isinstance(data, list):
        return [cls(**item) for item in data]
    return data


class MapAssistantClient:
    """Synchronous client for MAP Protocol."""

    def __init__(
        self,
        base_url: str = "http://localhost:8787",
        timeout: float = 30.0,
        retry_attempts: int = 3,
        retry_delay_ms: int = 1000,
        retry_max_delay_ms: int = 30000,
        retry_jitter: float = 0.1,
    ):
        self.transport = HTTPTransport(base_url=base_url, timeout=timeout)
        self._signer: Optional[HMACSigner] = None
        self.retry_attempts = retry_attempts
        self.retry_delay_ms = retry_delay_ms
        self.retry_max_delay_ms = retry_max_delay_ms
        self.retry_jitter = retry_jitter

    def configure_signing(self, key_id: str, secret: str) -> None:
        """Configure HMAC signing for requests."""
        self._signer = create_signer(key_id, secret)

    def _get_headers(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._signer and body:
            body_json = json.dumps(body, separators=(",", ":"))
            extra_headers = {"Content-Type": "application/json"}
            headers.update(self._signer.get_authorization_header(method, path, body_json, extra_headers))
        return headers

    def _calculate_retry_delay(self, attempt: int) -> float:
        exponential_delay = min(self.retry_delay_ms * (2 ** attempt), self.retry_max_delay_ms)
        jitter = exponential_delay * self.retry_jitter * (random.random() * 2 - 1)
        return (exponential_delay + jitter) / 1000.0

    def _dispatch_with_retry(self, body_dict: Dict[str, Any]) -> Dict[str, Any]:
        last_error = None
        for attempt in range(self.retry_attempts + 1):
            try:
                headers = self._get_headers("POST", "/api/v1/dispatch", body_dict)
                response = self.transport.post("/api/v1/dispatch", body_dict, headers=headers)
                if response.status_code < 400:
                    return json.loads(response.content)

                error_data = json.loads(response.content) if response.content else {}
                error_code = error_data.get("code", "internal_error")
                error_message = error_data.get("message", response.text)
                retryable = ERROR_CODE_RETRYABLE_MAP.get(error_code, response.status_code >= 500)

                if attempt < self.retry_attempts and retryable:
                    delay = self._calculate_retry_delay(attempt)
                    time.sleep(delay)
                    continue

                raise MapAPIError(
                    code=error_code,
                    message=error_message,
                    retryable=retryable,
                    status=response.status_code,
                )
            except MapAPIError:
                raise
            except Exception as e:
                last_error = e
                if attempt < self.retry_attempts:
                    delay = self._calculate_retry_delay(attempt)
                    time.sleep(delay)
                    continue
                raise MapAPIError(
                    code="request_timeout",
                    message=str(e),
                    retryable=True,
                    status=408,
                )
        raise last_error or MapAPIError(code="internal_error", message="Request failed", status=500)

    def dispatch(self, request: DispatchRequest) -> Dict[str, Any]:
        """Dispatch a task for execution."""
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        return self._dispatch_with_retry(body_dict)

    def approve(self, request: ApprovalRequest) -> bool:
        """Approve a task request."""
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        headers = self._get_headers("POST", "/api/v1/approve", body_dict)
        response = self.transport.post("/api/v1/approve", body_dict, headers=headers)
        return response.status_code == 200

    def get_task(self, task_id: str) -> Dict[str, Any]:
        """Get a task by ID."""
        headers = self._get_headers("GET", f"/api/v1/tasks/{task_id}")
        response = self.transport.get(f"/api/v1/tasks/{task_id}", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "resource_not_found"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def list_tasks(self, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """List tasks."""
        params = f"?limit={limit}"
        if status:
            params += f"&status={status}"
        headers = self._get_headers("GET", f"/api/v1/tasks{params}")
        response = self.transport.get(f"/api/v1/tasks{params}", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def list_agents(self) -> List[Dict[str, Any]]:
        """List available agents."""
        headers = self._get_headers("GET", "/api/v1/agents")
        response = self.transport.get("/api/v1/agents", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def get_health(self) -> Dict[str, Any]:
        """Get the health status of the MAP Protocol service."""
        response = self.transport.get("/api/v1/health")
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def close(self) -> None:
        """Close the client and release resources."""
        self.transport.close()


class AsyncMapAssistantClient:
    """Asynchronous client for MAP Protocol."""

    def __init__(
        self,
        base_url: str = "http://localhost:8787",
        timeout: float = 30.0,
        retry_attempts: int = 3,
        retry_delay_ms: int = 1000,
        retry_max_delay_ms: int = 30000,
        retry_jitter: float = 0.1,
    ):
        self.transport = AsyncHTTPTransport(base_url=base_url, timeout=timeout)
        self._signer: Optional[HMACSigner] = None
        self.retry_attempts = retry_attempts
        self.retry_delay_ms = retry_delay_ms
        self.retry_max_delay_ms = retry_max_delay_ms
        self.retry_jitter = retry_jitter

    def configure_signing(self, key_id: str, secret: str) -> None:
        """Configure HMAC signing for requests."""
        self._signer = create_signer(key_id, secret)

    async def _get_headers(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._signer and body:
            body_json = json.dumps(body, separators=(",", ":"))
            extra_headers = {"Content-Type": "application/json"}
            headers.update(self._signer.get_authorization_header(method, path, body_json, extra_headers))
        return headers

    async def _calculate_retry_delay(self, attempt: int) -> float:
        exponential_delay = min(self.retry_delay_ms * (2 ** attempt), self.retry_max_delay_ms)
        jitter = exponential_delay * self.retry_jitter * (random.random() * 2 - 1)
        return (exponential_delay + jitter) / 1000.0

    async def _dispatch_with_retry(self, body_dict: Dict[str, Any]) -> Dict[str, Any]:
        import asyncio
        last_error = None
        for attempt in range(self.retry_attempts + 1):
            try:
                headers = await self._get_headers("POST", "/api/v1/dispatch", body_dict)
                response = await self.transport.post("/api/v1/dispatch", body_dict, headers=headers)
                if response.status_code < 400:
                    return json.loads(response.content)

                error_data = json.loads(response.content) if response.content else {}
                error_code = error_data.get("code", "internal_error")
                error_message = error_data.get("message", response.text)
                retryable = ERROR_CODE_RETRYABLE_MAP.get(error_code, response.status_code >= 500)

                if attempt < self.retry_attempts and retryable:
                    delay = await self._calculate_retry_delay(attempt)
                    await asyncio.sleep(delay)
                    continue

                raise MapAPIError(
                    code=error_code,
                    message=error_message,
                    retryable=retryable,
                    status=response.status_code,
                )
            except MapAPIError:
                raise
            except Exception as e:
                last_error = e
                if attempt < self.retry_attempts:
                    delay = await self._calculate_retry_delay(attempt)
                    await asyncio.sleep(delay)
                    continue
                raise MapAPIError(
                    code="request_timeout",
                    message=str(e),
                    retryable=True,
                    status=408,
                )
        raise last_error or MapAPIError(code="internal_error", message="Request failed", status=500)

    async def dispatch(self, request: DispatchRequest) -> Dict[str, Any]:
        """Dispatch a task for execution."""
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        return await self._dispatch_with_retry(body_dict)

    async def approve(self, request: ApprovalRequest) -> bool:
        """Approve a task request."""
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        headers = await self._get_headers("POST", "/api/v1/approve", body_dict)
        response = await self.transport.post("/api/v1/approve", body_dict, headers=headers)
        return response.status_code == 200

    async def get_task(self, task_id: str) -> Dict[str, Any]:
        """Get a task by ID."""
        headers = await self._get_headers("GET", f"/api/v1/tasks/{task_id}")
        response = await self.transport.get(f"/api/v1/tasks/{task_id}", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "resource_not_found"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def list_tasks(self, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """List tasks."""
        params = f"?limit={limit}"
        if status:
            params += f"&status={status}"
        headers = await self._get_headers("GET", f"/api/v1/tasks{params}")
        response = await self.transport.get(f"/api/v1/tasks{params}", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def list_agents(self) -> List[Dict[str, Any]]:
        """List available agents."""
        headers = await self._get_headers("GET", "/api/v1/agents")
        response = await self.transport.get("/api/v1/agents", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def get_health(self) -> Dict[str, Any]:
        """Get the health status of the MAP Protocol service."""
        response = await self.transport.get("/api/v1/health")
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def close(self) -> None:
        """Close the client and release resources."""
        await self.transport.close()