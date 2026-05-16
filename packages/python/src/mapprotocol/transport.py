# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# SPDX-License-Identifier: Apache-2.0
"""
HTTP transport layer for MAP Protocol using httpx.
"""

from __future__ import annotations

import httpx
from typing import Optional, Dict, Any


class HTTPTransport:
    """Synchronous HTTP transport using httpx."""

    def __init__(self, base_url: str = "http://localhost:8787", timeout: float = 30.0):
        """
        Initialize the HTTP transport.

        Args:
            base_url: Base URL for the MAP Protocol API.
            timeout: Request timeout in seconds.
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.Client] = None

    def _get_client(self) -> httpx.Client:
        """Get or create the HTTP client."""
        if self._client is None:
            self._client = httpx.Client(base_url=self.base_url, timeout=self.timeout)
        return self._client

    def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None:
            self._client.close()
            self._client = None

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        """
        Make an HTTP request.

        Args:
            method: HTTP method.
            path: Request path.
            body: Request body.
            headers: Additional headers.

        Returns:
            HTTP response.
        """
        client = self._get_client()
        return client.request(method, path, json=body, headers=headers)

    def get(self, path: str, headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make a GET request."""
        return self.request("GET", path, headers=headers)

    def post(self, path: str, body: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make a POST request."""
        return self.request("POST", path, body=body, headers=headers)

    def put(self, path: str, body: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make a PUT request."""
        return self.request("PUT", path, body=body, headers=headers)

    def delete(self, path: str, headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make a DELETE request."""
        return self.request("DELETE", path, headers=headers)


class AsyncHTTPTransport:
    """Asynchronous HTTP transport using httpx."""

    def __init__(self, base_url: str = "http://localhost:8787", timeout: float = 30.0):
        """
        Initialize the async HTTP transport.

        Args:
            base_url: Base URL for the MAP Protocol API.
            timeout: Request timeout in seconds.
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)
        return self._client

    async def close(self) -> None:
        """Close the async HTTP client."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        """
        Make an async HTTP request.

        Args:
            method: HTTP method.
            path: Request path.
            body: Request body.
            headers: Additional headers.

        Returns:
            HTTP response.
        """
        client = await self._get_client()
        return await client.request(method, path, json=body, headers=headers)

    async def get(self, path: str, headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make an async GET request."""
        return await self.request("GET", path, headers=headers)

    async def post(self, path: str, body: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make an async POST request."""
        return await self.request("POST", path, body=body, headers=headers)

    async def put(self, path: str, body: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make an async PUT request."""
        return await self.request("PUT", path, body=body, headers=headers)

    async def delete(self, path: str, headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Make an async DELETE request."""
        return await self.request("DELETE", path, headers=headers)
