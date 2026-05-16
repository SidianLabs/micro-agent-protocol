# SPDX-License-Identifier: Apache-2.0
"""
Main client for MAP Protocol.
"""

from __future__ import annotations

import json
import random
import time
import urllib.parse
from typing import (
    Any,
    AsyncIterator,
    Dict,
    Iterator,
    List,
    Optional,
    Tuple,
    Type,
    TypeVar,
)

from mapprotocol.errors import (
    ERROR_CODE_RETRYABLE_MAP,
    MapAPIError,
    MapRetryableError,
    MapTimeoutError,
    MapValidationError,
)
from mapprotocol.signing import HMACSigner, create_signer
from mapprotocol.signing_http import HTTPSigner
from mapprotocol.transport import AsyncHTTPTransport, HTTPTransport
from mapprotocol.types import (
    AgentDescriptor,
    ApprovalRequest,
    DispatchRequest,
    ResultPackage,
    TaskEnvelope,
    TaskRecord,
)

T = TypeVar("T")


def _decode_json(content: bytes, cls: Type[T]) -> T:
    """Decode JSON content to a type."""
    data = json.loads(content)
    if isinstance(data, dict):
        return cls(**data)
    elif isinstance(data, list):
        return [cls(**item) for item in data]
    return data


class _SSETaskIterator:
    """Synchronous SSE task event iterator.

    Parses SSE text/event-stream data into TaskEvent dicts.
    """

    def __init__(
        self,
        stream_url: str,
        timeout: float,
        headers: Dict[str, str],
    ):
        self._stream_url = stream_url
        self._timeout = timeout
        self._headers = headers
        self._buffer = ""
        self._response = None
        self._iterator = None

    def __iter__(self):
        return self

    def __next__(self) -> Dict[str, Any]:
        if self._response is None:
            self._connect()
        try:
            return self._read_event()
        except StopIteration:
            self._close()
            raise

    def _connect(self):
        """Open the SSE connection."""
        import httpx

        client = httpx.Client(timeout=httpx.Timeout(self._timeout, connect=10.0))
        self._response = client.send(
            client.build_request(
                "GET",
                self._stream_url,
                headers={**self._headers, "Accept": "text/event-stream"},
            ),
            stream=True,
        )
        if self._response.status_code >= 400:
            body = self._response.read().decode("utf-8", errors="replace")
            try:
                error_data = json.loads(body)
            except json.JSONDecodeError:
                error_data = {}
            raise MapAPIError(
                code=error_data.get("code", "request_failed"),
                message=error_data.get("message", f"HTTP {self._response.status_code}"),
                status=self._response.status_code,
            )
        self._iterator = self._response.iter_bytes()

    def _parse_sse(self, chunk: bytes) -> List[Dict[str, Any]]:
        """Parse SSE chunk into TaskEvent dicts."""
        events: List[Dict[str, Any]] = []
        self._buffer += chunk.decode("utf-8", errors="replace")

        parts = self._buffer.split("\n\n")
        self._buffer = parts.pop() if parts else ""

        for part in parts:
            event_type = ""
            data = ""
            for line in part.split("\n"):
                if line.startswith("event: "):
                    event_type = line[7:].strip()
                elif line.startswith("data: "):
                    data = line[6:].strip()

            if not data:
                continue

            try:
                parsed = json.loads(data)
                events.append(parsed)
            except json.JSONDecodeError:
                if event_type and data:
                    try:
                        events.append({"type": event_type, **json.loads(data)})
                    except (json.JSONDecodeError, TypeError):
                        pass

        return events

    def _read_event(self) -> Dict[str, Any]:
        """Read the next event from the stream."""
        if self._iterator is None:
            raise StopIteration

        while True:
            try:
                chunk = next(self._iterator)
                events = self._parse_sse(chunk)
                if events:
                    return events[0]
            except StopIteration:
                break

        raise StopIteration

    def _close(self):
        """Close the SSE connection."""
        if self._response is not None:
            self._response.close()
            self._response = None
            self._iterator = None

    def close(self):
        """Close the SSE connection."""
        self._close()


class _AsyncSSETaskIterator:
    """Asynchronous SSE task event iterator.

    Parses SSE text/event-stream data into TaskEvent dicts.
    """

    def __init__(
        self,
        stream_url: str,
        timeout: float,
        headers: Dict[str, str],
    ):
        self._stream_url = stream_url
        self._timeout = timeout
        self._headers = headers
        self._buffer = ""
        self._response = None
        self._aiter = None

    def __aiter__(self):
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if self._response is None:
            await self._connect()
        try:
            return await self._read_event()
        except StopAsyncIteration:
            await self._close()
            raise

    async def _connect(self):
        """Open the SSE connection."""
        import httpx

        client = httpx.AsyncClient(timeout=httpx.Timeout(self._timeout, connect=10.0))
        self._response = await client.send(
            client.build_request(
                "GET",
                self._stream_url,
                headers={**self._headers, "Accept": "text/event-stream"},
            ),
            stream=True,
        )
        if self._response.status_code >= 400:
            body = await self._response.aread()
            body_str = body.decode("utf-8", errors="replace")
            try:
                error_data = json.loads(body_str)
            except json.JSONDecodeError:
                error_data = {}
            await client.aclose()
            raise MapAPIError(
                code=error_data.get("code", "request_failed"),
                message=error_data.get("message", f"HTTP {self._response.status_code}"),
                status=self._response.status_code,
            )
        self._aiter = self._response.aiter_bytes()

    def _parse_sse(self, chunk: bytes) -> List[Dict[str, Any]]:
        """Parse SSE chunk into TaskEvent dicts."""
        events: List[Dict[str, Any]] = []
        self._buffer += chunk.decode("utf-8", errors="replace")

        parts = self._buffer.split("\n\n")
        self._buffer = parts.pop() if parts else ""

        for part in parts:
            event_type = ""
            data = ""
            for line in part.split("\n"):
                if line.startswith("event: "):
                    event_type = line[7:].strip()
                elif line.startswith("data: "):
                    data = line[6:].strip()

            if not data:
                continue

            try:
                parsed = json.loads(data)
                events.append(parsed)
            except json.JSONDecodeError:
                if event_type and data:
                    try:
                        events.append({"type": event_type, **json.loads(data)})
                    except (json.JSONDecodeError, TypeError):
                        pass

        return events

    async def _read_event(self) -> Dict[str, Any]:
        """Read the next event from the stream."""
        if self._aiter is None:
            raise StopAsyncIteration

        while True:
            try:
                chunk = await self._aiter.__anext__()
                events = self._parse_sse(chunk)
                if events:
                    return events[0]
            except StopAsyncIteration:
                break

        raise StopAsyncIteration

    async def _close(self):
        """Close the SSE connection."""
        if self._response is not None:
            await self._response.aclose()
            self._response = None
            self._aiter = None

    async def close(self):
        """Close the SSE connection."""
        await self._close()


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
        self._http_signer: Optional[HTTPSigner] = None
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retry_attempts = retry_attempts
        self.retry_delay_ms = retry_delay_ms
        self.retry_max_delay_ms = retry_max_delay_ms
        self.retry_jitter = retry_jitter
        self._middleware_stack: list = []

    def configureSigning(self, key_id: str, secret: str) -> None:
        """Configure HMAC signing for requests (JWS MAPSIG format).

        Args:
            key_id: The key identifier.
            secret: The HMAC shared secret.
        """
        self._http_signer = HTTPSigner(key_id, secret)
        self._signer = create_signer(key_id, secret)

    def configure_signing(self, key_id: str, secret: str) -> None:
        """Configure HMAC signing for requests (legacy method).

        Args:
            key_id: The key identifier.
            secret: The HMAC shared secret.
        """
        self.configureSigning(key_id, secret)

    def _get_headers(
        self, method: str, path: str, body: Optional[Dict[str, Any]] = None
    ) -> Dict[str, str]:
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self._http_signer:
            body_json = json.dumps(body, separators=(",", ":")) if body else None
            timestamp = str(int(time.time()))
            signing_headers = self._http_signer.get_authorization_header(
                method, path, timestamp, body_json
            )
            headers.update(signing_headers)
        elif self._signer and body:
            body_json = json.dumps(body, separators=(",", ":"))
            extra_headers = {"Content-Type": "application/json"}
            headers.update(
                self._signer.get_authorization_header(
                    method, path, body_json, extra_headers
                )
            )
        return headers

    def _calculate_retry_delay(self, attempt: int) -> float:
        exponential_delay = min(
            self.retry_delay_ms * (2**attempt), self.retry_max_delay_ms
        )
        jitter = exponential_delay * self.retry_jitter * (random.random() * 2 - 1)
        return (exponential_delay + jitter) / 1000.0

    def _dispatch_with_retry(self, body_dict: Dict[str, Any]) -> Dict[str, Any]:
        last_error = None
        for attempt in range(self.retry_attempts + 1):
            try:
                headers = self._get_headers("POST", "/dispatch", body_dict)
                response = self.transport.post("/dispatch", body_dict, headers=headers)
                if response.status_code < 400:
                    return json.loads(response.content)

                error_data = json.loads(response.content) if response.content else {}
                error_code = error_data.get("code", "internal_error")
                error_message = error_data.get("message", response.text)
                retryable = ERROR_CODE_RETRYABLE_MAP.get(
                    error_code, response.status_code >= 500
                )

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
        raise last_error or MapAPIError(
            code="internal_error", message="Request failed", status=500
        )

    def dispatch(self, request: DispatchRequest) -> Dict[str, Any]:
        """Dispatch a task for execution."""
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        return self._dispatch_with_retry(body_dict)

    def approve(self, request: ApprovalRequest) -> Dict[str, Any]:
        """Approve a task request.

        Returns:
            Dict with 'result' and 'receipt' keys.
        """
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        headers = self._get_headers("POST", "/approve", body_dict)
        response = self.transport.post("/approve", body_dict, headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "approval_denied"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def cancel_task(
        self, task_id: str, tenant_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Cancel a task by ID.

        Args:
            task_id: The task identifier.
            tenant_id: Optional tenant identifier.

        Returns:
            Dict with 'result' and 'receipt' keys.
        """
        path = f"/tasks/{urllib.parse.quote(task_id, safe='')}/cancel"
        if tenant_id:
            path += f"?tenant_id={urllib.parse.quote(tenant_id, safe='')}"
        headers = self._get_headers("POST", path)
        response = self.transport.post(path, {}, headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "resource_not_found"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def get_task(self, task_id: str, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        """Get a task by ID."""
        path = f"/tasks/{urllib.parse.quote(task_id, safe='')}"
        if tenant_id:
            path += f"?tenant_id={urllib.parse.quote(tenant_id, safe='')}"
        headers = self._get_headers("GET", path)
        response = self.transport.get(path, headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "resource_not_found"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def list_tasks(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List tasks with optional filters.

        Returns:
            Dict with 'tasks' list and optional 'pagination'.
        """
        params = f"?limit={limit}"
        if status:
            params += f"&status={urllib.parse.quote(status, safe='')}"
        if cursor:
            params += f"&cursor={urllib.parse.quote(cursor, safe='')}"
        headers = self._get_headers("GET", f"/tasks{params}")
        response = self.transport.get(f"/tasks{params}", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def list_agents(
        self, domain: Optional[str] = None, capability: Optional[str] = None
    ) -> Dict[str, Any]:
        """List available agents with optional filters."""
        query_parts = []
        if domain:
            query_parts.append(f"domain={urllib.parse.quote(domain, safe='')}")
        if capability:
            query_parts.append(f"capability={urllib.parse.quote(capability, safe='')}")
        params = f"?{'&'.join(query_parts)}" if query_parts else ""
        headers = self._get_headers("GET", f"/agents{params}")
        response = self.transport.get(f"/agents{params}", headers=headers)
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
        response = self.transport.get("/health")
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def get_status(self) -> Dict[str, Any]:
        """Get the status of the MAP Protocol service."""
        headers = self._get_headers("GET", "/status")
        response = self.transport.get("/status", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    def stream_task(self, task_id: str) -> _SSETaskIterator:
        """Stream task events via SSE.

        Opens an SSE connection to GET /tasks/{taskId}/stream,
        parses incoming events, and yields them as they arrive.

        Args:
            task_id: The task identifier.

        Returns:
            An iterator of TaskEvent dicts.
        """
        path = f"/tasks/{urllib.parse.quote(task_id, safe='')}/stream"
        stream_url = f"{self.base_url}{path}"
        headers = self._get_headers("GET", path)
        return _SSETaskIterator(stream_url, self.timeout, headers)

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
        self._http_signer: Optional[HTTPSigner] = None
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retry_attempts = retry_attempts
        self.retry_delay_ms = retry_delay_ms
        self.retry_max_delay_ms = retry_max_delay_ms
        self.retry_jitter = retry_jitter
        self._middleware_stack: list = []

    def configureSigning(self, key_id: str, secret: str) -> None:
        """Configure HMAC signing for requests (JWS MAPSIG format).

        Args:
            key_id: The key identifier.
            secret: The HMAC shared secret.
        """
        self._http_signer = HTTPSigner(key_id, secret)
        self._signer = create_signer(key_id, secret)

    def configure_signing(self, key_id: str, secret: str) -> None:
        """Configure HMAC signing for requests (legacy method).

        Args:
            key_id: The key identifier.
            secret: The HMAC shared secret.
        """
        self.configureSigning(key_id, secret)

    async def _get_headers(
        self, method: str, path: str, body: Optional[Dict[str, Any]] = None
    ) -> Dict[str, str]:
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self._http_signer:
            body_json = json.dumps(body, separators=(",", ":")) if body else None
            timestamp = str(int(time.time()))
            signing_headers = self._http_signer.get_authorization_header(
                method, path, timestamp, body_json
            )
            headers.update(signing_headers)
        elif self._signer and body:
            body_json = json.dumps(body, separators=(",", ":"))
            extra_headers = {"Content-Type": "application/json"}
            headers.update(
                self._signer.get_authorization_header(
                    method, path, body_json, extra_headers
                )
            )
        return headers

    async def _calculate_retry_delay(self, attempt: int) -> float:
        exponential_delay = min(
            self.retry_delay_ms * (2**attempt), self.retry_max_delay_ms
        )
        jitter = exponential_delay * self.retry_jitter * (random.random() * 2 - 1)
        return (exponential_delay + jitter) / 1000.0

    async def _dispatch_with_retry(self, body_dict: Dict[str, Any]) -> Dict[str, Any]:
        import asyncio

        last_error = None
        for attempt in range(self.retry_attempts + 1):
            try:
                headers = await self._get_headers("POST", "/dispatch", body_dict)
                response = await self.transport.post(
                    "/dispatch", body_dict, headers=headers
                )
                if response.status_code < 400:
                    return json.loads(response.content)

                error_data = json.loads(response.content) if response.content else {}
                error_code = error_data.get("code", "internal_error")
                error_message = error_data.get("message", response.text)
                retryable = ERROR_CODE_RETRYABLE_MAP.get(
                    error_code, response.status_code >= 500
                )

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
        raise last_error or MapAPIError(
            code="internal_error", message="Request failed", status=500
        )

    async def dispatch(self, request: DispatchRequest) -> Dict[str, Any]:
        """Dispatch a task for execution."""
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        return await self._dispatch_with_retry(body_dict)

    async def approve(self, request: ApprovalRequest) -> Dict[str, Any]:
        """Approve a task request.

        Returns:
            Dict with 'result' and 'receipt' keys.
        """
        body_dict = {k: v for k, v in request.__dict__.items() if v is not None}
        headers = await self._get_headers("POST", "/approve", body_dict)
        response = await self.transport.post("/approve", body_dict, headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "approval_denied"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def cancel_task(
        self, task_id: str, tenant_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Cancel a task by ID.

        Args:
            task_id: The task identifier.
            tenant_id: Optional tenant identifier.

        Returns:
            Dict with 'result' and 'receipt' keys.
        """
        path = f"/tasks/{urllib.parse.quote(task_id, safe='')}/cancel"
        if tenant_id:
            path += f"?tenant_id={urllib.parse.quote(tenant_id, safe='')}"
        headers = await self._get_headers("POST", path)
        response = await self.transport.post(path, {}, headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "resource_not_found"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def get_task(
        self, task_id: str, tenant_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get a task by ID."""
        path = f"/tasks/{urllib.parse.quote(task_id, safe='')}"
        if tenant_id:
            path += f"?tenant_id={urllib.parse.quote(tenant_id, safe='')}"
        headers = await self._get_headers("GET", path)
        response = await self.transport.get(path, headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "resource_not_found"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def list_tasks(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List tasks with optional filters.

        Returns:
            Dict with 'tasks' list and optional 'pagination'.
        """
        params = f"?limit={limit}"
        if status:
            params += f"&status={urllib.parse.quote(status, safe='')}"
        if cursor:
            params += f"&cursor={urllib.parse.quote(cursor, safe='')}"
        headers = await self._get_headers("GET", f"/tasks{params}")
        response = await self.transport.get(f"/tasks{params}", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def list_agents(
        self, domain: Optional[str] = None, capability: Optional[str] = None
    ) -> Dict[str, Any]:
        """List available agents with optional filters."""
        query_parts = []
        if domain:
            query_parts.append(f"domain={urllib.parse.quote(domain, safe='')}")
        if capability:
            query_parts.append(f"capability={urllib.parse.quote(capability, safe='')}")
        params = f"?{'&'.join(query_parts)}" if query_parts else ""
        headers = await self._get_headers("GET", f"/agents{params}")
        response = await self.transport.get(f"/agents{params}", headers=headers)
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
        response = await self.transport.get("/health")
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def get_status(self) -> Dict[str, Any]:
        """Get the status of the MAP Protocol service."""
        headers = await self._get_headers("GET", "/status")
        response = await self.transport.get("/status", headers=headers)
        if response.status_code >= 400:
            error_data = json.loads(response.content) if response.content else {}
            raise MapAPIError(
                code=error_data.get("code", "internal_error"),
                message=error_data.get("message", response.text),
                status=response.status_code,
            )
        return json.loads(response.content)

    async def stream_task(self, task_id: str) -> _AsyncSSETaskIterator:
        """Stream task events via SSE.

        Opens an SSE connection to GET /tasks/{taskId}/stream,
        parses incoming events, and yields them as they arrive.

        Args:
            task_id: The task identifier.

        Returns:
            An async iterator of TaskEvent dicts.
        """
        path = f"/tasks/{urllib.parse.quote(task_id, safe='')}/stream"
        stream_url = f"{self.base_url}{path}"
        headers = await self._get_headers("GET", path)
        return _AsyncSSETaskIterator(stream_url, self.timeout, headers)

    async def close(self) -> None:
        """Close the client and release resources."""
        await self.transport.close()
