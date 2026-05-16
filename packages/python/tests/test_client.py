# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol client.
"""

import pytest

from mapprotocol.client import AsyncMapAssistantClient, MapAssistantClient
from mapprotocol.types import DispatchRequest


class TestMapAssistantClient:
    """Tests for the synchronous MapAssistantClient."""

    def test_client_initialization(self):
        """Test client can be initialized with default settings."""
        client = MapAssistantClient()
        assert client is not None
        assert client.transport.base_url == "http://localhost:8787"
        client.close()

    def test_client_custom_base_url(self):
        """Test client can be initialized with custom base URL."""
        client = MapAssistantClient(base_url="http://custom:9000")
        assert client.transport.base_url == "http://custom:9000"
        client.close()

    def test_configure_signing(self):
        """Test signing configuration."""
        client = MapAssistantClient()
        client.configure_signing(key_id="test-key", secret="test-secret")
        assert client._signer is not None
        assert client._signer.key_id == "test-key"
        client.close()


class TestAsyncMapAssistantClient:
    """Tests for the asynchronous AsyncMapAssistantClient."""

    def test_async_client_initialization(self):
        """Test async client can be initialized with default settings."""
        client = AsyncMapAssistantClient()
        assert client is not None
        assert client.transport.base_url == "http://localhost:8787"

    @pytest.mark.asyncio
    async def test_async_client_custom_base_url(self):
        """Test async client can be initialized with custom base URL."""
        client = AsyncMapAssistantClient(base_url="http://custom:9000")
        assert client.transport.base_url == "http://custom:9000"
        await client.close()

    @pytest.mark.asyncio
    async def test_async_configure_signing(self):
        """Test async signing configuration."""
        client = AsyncMapAssistantClient()
        client.configure_signing(key_id="test-key", secret="test-secret")
        assert client._signer is not None
        assert client._signer.key_id == "test-key"
        await client.close()


class TestDispatchIntegration:
    """Integration tests for dispatch functionality."""

    def test_dispatch_request_structure(self, sample_dispatch_request):
        """Test that dispatch request has correct structure."""
        assert isinstance(sample_dispatch_request, DispatchRequest)
        assert sample_dispatch_request.envelope is not None
        assert sample_dispatch_request.capability == "payment"

    @pytest.mark.asyncio
    async def test_async_dispatch_not_implemented(self, sample_dispatch_request):
        """Placeholder for async dispatch test."""
        pass
