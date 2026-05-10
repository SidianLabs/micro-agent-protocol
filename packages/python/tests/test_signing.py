# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol signing utilities.
"""

import pytest
from mapprotocol.signing import HMACSigner, create_signer


class TestHMACSigner:
    """Tests for HMACSigner class."""

    def test_signer_initialization(self):
        """Test signer can be initialized."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        assert signer.key_id == "test-key"
        assert signer.secret == b"test-secret"

    def test_hash_body(self):
        """Test body hashing."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        body = '{"key": "value"}'
        hash_result = signer.hash_body(body)
        assert isinstance(hash_result, str)
        assert len(hash_result) == 64

    def test_sign_without_body(self):
        """Test signing without request body."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        signature = signer.sign(method="GET", path="/api/v1/tasks")
        assert isinstance(signature, str)

    def test_sign_with_body(self):
        """Test signing with request body."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        body = '{"task_id": "123"}'
        signature = signer.sign(method="POST", path="/api/v1/dispatch", body=body)
        assert isinstance(signature, str)

    def test_sign_with_headers(self):
        """Test signing with headers."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        headers = {"X-Request-ID": "req-123", "X-Timestamp": "1234567890"}
        signature = signer.sign(method="GET", path="/api/v1/tasks", headers=headers)
        assert isinstance(signature, str)

    def test_get_authorization_header(self):
        """Test getting authorization header."""
        signer = HMACSigner(key_id="my-key-id", secret="my-secret")
        auth_header = signer.get_authorization_header(method="GET", path="/api/v1/health")
        assert "Authorization" in auth_header
        assert auth_header["Authorization"].startswith("HMAC my-key-id:")


class TestCreateSigner:
    """Tests for create_signer factory function."""

    def test_create_signer_returns_signer(self):
        """Test factory returns HMACSigner instance."""
        signer = create_signer(key_id="key", secret="secret")
        assert isinstance(signer, HMACSigner)
        assert signer.key_id == "key"

    def test_create_signer_with_different_credentials(self):
        """Test factory with different credentials."""
        signer1 = create_signer(key_id="key1", secret="secret1")
        signer2 = create_signer(key_id="key2", secret="secret2")
        assert signer1.key_id != signer2.key_id
