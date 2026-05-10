# SPDX-License-Identifier: Apache-2.0
"""
Webhook support for MAP Protocol.

Provides webhook sending with retry, backoff, and signature verification.
"""

from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class WebhookEventType(str, Enum):
    """Webhook event types for task lifecycle."""

    TASK_DISPATCHED = "task.dispatched"
    TASK_PROPOSED = "task.proposed"
    TASK_ACCEPTED = "task.accepted"
    TASK_AWAITING_APPROVAL = "task.awaiting_approval"
    TASK_DENIED = "task.denied"
    TASK_RUNNING = "task.running"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
    TASK_REVOKED = "task.revoked"
    AGENT_REGISTERED = "agent.registered"
    AGENT_DEREGISTERED = "agent.deregistered"


@dataclass
class WebhookEvent:
    """A webhook event to be sent."""

    id: str
    type: WebhookEventType
    timestamp: str
    data: Dict[str, Any]
    retry_count: int = 0


@dataclass
class WebhookDeliveryResult:
    """Result of a webhook delivery attempt."""

    ok: bool
    status_code: Optional[int] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None


class WebhookSender:
    """
    Webhook sender with retry and backoff support.

    Supports signature verification for webhook payloads.
    """

    def __init__(
        self,
        secret: str = "",
        max_retries: int = 3,
        base_delay_ms: int = 1000,
        max_delay_ms: int = 30000,
        timeout_ms: int = 30000,
    ):
        """
        Initialize the webhook sender.

        Args:
            secret: Secret for signing webhook payloads.
            max_retries: Maximum number of retry attempts.
            base_delay_ms: Base delay in milliseconds for exponential backoff.
            max_delay_ms: Maximum delay in milliseconds.
            timeout_ms: Request timeout in milliseconds.
        """
        self.secret = secret
        self.max_retries = max_retries
        self.base_delay_ms = base_delay_ms
        self.max_delay_ms = max_delay_ms
        self.timeout_ms = timeout_ms

    def send(
        self,
        url: str,
        event: WebhookEvent,
        headers: Optional[Dict[str, str]] = None,
    ) -> WebhookDeliveryResult:
        """
        Send a webhook event to a URL with retry.

        Args:
            url: The webhook URL.
            event: The event to send.
            headers: Optional additional headers.

        Returns:
            WebhookDeliveryResult indicating success or failure.
        """
        import httpx

        start_time = time.perf_counter()
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                result = self._send_single(url, event, headers)

                if result.ok:
                    return result

                last_error = result.error

                if attempt < self.max_retries:
                    delay = self._calculate_backoff(attempt)
                    time.sleep(delay / 1000)

            except Exception as e:
                last_error = str(e)
                if attempt < self.max_retries:
                    delay = self._calculate_backoff(attempt)
                    time.sleep(delay / 1000)

        duration_ms = int((time.perf_counter() - start_time) * 1000)
        return WebhookDeliveryResult(
            ok=False,
            error=last_error or "Max retries exceeded",
            duration_ms=duration_ms,
        )

    def _send_single(
        self,
        url: str,
        event: WebhookEvent,
        headers: Optional[Dict[str, str]],
    ) -> WebhookDeliveryResult:
        """Send a single webhook request without retry."""
        import httpx

        start_time = time.perf_counter()

        # Build headers
        request_headers = {
            "Content-Type": "application/json",
            "X-MAP-Webhook-Event": event.type.value,
            "X-MAP-Webhook-Delivery": event.id,
        }

        # Add signature if secret is configured
        if self.secret:
            signature_headers = self._sign_payload(event)
            request_headers.update(signature_headers)

        # Merge additional headers
        if headers:
            request_headers.update(headers)

        try:
            with httpx.Client(timeout=self.timeout_ms / 1000) as client:
                response = client.post(
                    url,
                    json=event.data,
                    headers=request_headers,
                )

            duration_ms = int((time.perf_counter() - start_time) * 1000)

            if response.status_code >= 200 and response.status_code < 300:
                return WebhookDeliveryResult(
                    ok=True,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
            else:
                return WebhookDeliveryResult(
                    ok=False,
                    status_code=response.status_code,
                    error=f"HTTP {response.status_code}",
                    duration_ms=duration_ms,
                )

        except httpx.TimeoutException:
            return WebhookDeliveryResult(
                ok=False,
                error="Request timeout",
                duration_ms=int((time.perf_counter() - start_time) * 1000),
            )
        except Exception as e:
            return WebhookDeliveryResult(
                ok=False,
                error=str(e),
                duration_ms=int((time.perf_counter() - start_time) * 1000),
            )

    def _calculate_backoff(self, attempt: int) -> int:
        """Calculate delay with exponential backoff and jitter."""
        import random

        exponential_delay = min(self.base_delay_ms * (2**attempt), self.max_delay_ms)
        jitter = exponential_delay * 0.1 * (random.random() * 2 - 1)
        return int(exponential_delay + jitter)

    def _sign_payload(self, event: WebhookEvent) -> Dict[str, str]:
        """Sign a webhook payload."""
        timestamp = str(int(time.time()))
        payload = f"{event.id}.{timestamp}.{_json_dumps(event.data)}"
        signature = hmac.new(
            self.secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        return {
            "X-MAP-Webhook-Signature": signature,
            "X-MAP-Webhook-Timestamp": timestamp,
        }

    async def send_async(
        self,
        url: str,
        event: WebhookEvent,
        headers: Optional[Dict[str, str]] = None,
    ) -> WebhookDeliveryResult:
        """
        Send a webhook event asynchronously with retry.

        Args:
            url: The webhook URL.
            event: The event to send.
            headers: Optional additional headers.

        Returns:
            WebhookDeliveryResult indicating success or failure.
        """
        import asyncio

        import httpx

        start_time = time.perf_counter()
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                result = await self._send_single_async(url, event, headers)

                if result.ok:
                    return result

                last_error = result.error

                if attempt < self.max_retries:
                    delay = self._calculate_backoff(attempt)
                    await asyncio.sleep(delay / 1000)

            except Exception as e:
                last_error = str(e)
                if attempt < self.max_retries:
                    delay = self._calculate_backoff(attempt)
                    await asyncio.sleep(delay / 1000)

        duration_ms = int((time.perf_counter() - start_time) * 1000)
        return WebhookDeliveryResult(
            ok=False,
            error=last_error or "Max retries exceeded",
            duration_ms=duration_ms,
        )

    async def _send_single_async(
        self,
        url: str,
        event: WebhookEvent,
        headers: Optional[Dict[str, str]],
    ) -> WebhookDeliveryResult:
        """Send a single webhook request asynchronously."""
        import httpx

        start_time = time.perf_counter()

        # Build headers
        request_headers = {
            "Content-Type": "application/json",
            "X-MAP-Webhook-Event": event.type.value,
            "X-MAP-Webhook-Delivery": event.id,
        }

        # Add signature if secret is configured
        if self.secret:
            signature_headers = self._sign_payload(event)
            request_headers.update(signature_headers)

        # Merge additional headers
        if headers:
            request_headers.update(headers)

        try:
            async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
                response = await client.post(
                    url,
                    json=event.data,
                    headers=request_headers,
                )

            duration_ms = int((time.perf_counter() - start_time) * 1000)

            if response.status_code >= 200 and response.status_code < 300:
                return WebhookDeliveryResult(
                    ok=True,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
            else:
                return WebhookDeliveryResult(
                    ok=False,
                    status_code=response.status_code,
                    error=f"HTTP {response.status_code}",
                    duration_ms=duration_ms,
                )

        except httpx.TimeoutException:
            return WebhookDeliveryResult(
                ok=False,
                error="Request timeout",
                duration_ms=int((time.perf_counter() - start_time) * 1000),
            )
        except Exception as e:
            return WebhookDeliveryResult(
                ok=False,
                error=str(e),
                duration_ms=int((time.perf_counter() - start_time) * 1000),
            )


def create_webhook_event(
    event_type: WebhookEventType,
    data: Dict[str, Any],
) -> WebhookEvent:
    """
    Create a new webhook event with a unique ID.

    Args:
        event_type: The type of event.
        data: The event data.

    Returns:
        A new WebhookEvent instance.
    """
    return WebhookEvent(
        id=f"wh_{uuid.uuid4().hex[:12]}",
        type=event_type,
        timestamp=datetime.now(timezone.utc).isoformat(),
        data=data,
    )


def verify_webhook_signature(
    payload: str,
    signature: str,
    timestamp: str,
    secret: str,
    tolerance_seconds: int = 300,
) -> bool:
    """
    Verify a webhook signature.

    Args:
        payload: The raw payload string.
        signature: The signature to verify.
        timestamp: The timestamp from the webhook header.
        secret: The webhook secret.
        tolerance_seconds: Maximum age of the webhook in seconds.

    Returns:
        True if the signature is valid.
    """
    try:
        # Check timestamp tolerance
        ts = int(timestamp)
        current_time = int(time.time())
        if abs(current_time - ts) > tolerance_seconds:
            return False

        # Compute expected signature
        expected_payload = f"payload.{timestamp}.{payload}"
        expected_signature = hmac.new(
            secret.encode("utf-8"), expected_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(signature, expected_signature)

    except (ValueError, TypeError):
        return False


def task_status_to_event_type(status: str) -> WebhookEventType:
    """
    Convert a task status to the corresponding webhook event type.

    Args:
        status: The task status string.

    Returns:
        The corresponding WebhookEventType.
    """
    mapping = {
        "accepted": WebhookEventType.TASK_ACCEPTED,
        "proposed": WebhookEventType.TASK_PROPOSED,
        "awaiting_approval": WebhookEventType.TASK_AWAITING_APPROVAL,
        "denied": WebhookEventType.TASK_DENIED,
        "running": WebhookEventType.TASK_RUNNING,
        "completed": WebhookEventType.TASK_COMPLETED,
        "failed": WebhookEventType.TASK_FAILED,
        "revoked": WebhookEventType.TASK_REVOKED,
    }
    return mapping.get(status, WebhookEventType.TASK_DISPATCHED)


def _json_dumps(data: Dict[str, Any]) -> str:
    """Serialize data to JSON string deterministically."""
    import json

    return json.dumps(data, sort_keys=True, separators=(",", ":"))
