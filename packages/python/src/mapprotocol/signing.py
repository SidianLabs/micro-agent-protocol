# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# SPDX-License-Identifier: Apache-2.0
"""
Signing utilities for MAP Protocol.

Supports both HMAC and RSA signing schemes.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union


class Signer(ABC):
    """Abstract base class for signers."""

    @property
    @abstractmethod
    def key_id(self) -> str:
        """Get the key identifier."""
        pass

    @abstractmethod
    def sign(self, method: str, path: str, timestamp: str, body_hash: str) -> str:
        """Create a signature for a request."""
        pass

    @abstractmethod
    def hash_body(self, body: Optional[str]) -> str:
        """Create a hash of the request body."""
        pass


class HMACSigner(Signer):
    """HMAC-based signer for MAP Protocol requests."""

    def __init__(self, key_id: str, secret: str):
        """
        Initialize the HMAC signer.

        Args:
            key_id: The key identifier.
            secret: The secret key for signing.
        """
        self._key_id = key_id
        self._secret = secret.encode("utf-8")

    @property
    def key_id(self) -> str:
        """Get the key identifier."""
        return self._key_id

    def sign(self, method: str, path: str, timestamp: str, body_hash: str) -> str:
        """
        Create an HMAC signature for a request.

        Args:
            method: HTTP method (GET, POST, etc.).
            path: Request path.
            timestamp: Unix timestamp string.
            body_hash: Hash of the request body.

        Returns:
            Base64-encoded signature.
        """
        message = f"{method}\n{path}\n{timestamp}\n{body_hash}"
        signature = hmac.new(self._secret, message.encode("utf-8"), hashlib.sha256)
        return base64.b64encode(signature.digest()).decode("utf-8")

    def hash_body(self, body: Optional[str]) -> str:
        """
        Create a SHA-256 hash of the request body.

        Args:
            body: Request body as a string.

        Returns:
            Hex-encoded hash.
        """
        if not body:
            return ""
        return hashlib.sha256(body.encode("utf-8")).hexdigest()

    def get_authorization_header(
        self,
        method: str,
        path: str,
        body: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        """
        Get the Authorization header for a request.

        Args:
            method: HTTP method.
            path: Request path.
            body: Request body.
            headers: Optional request headers.

        Returns:
            Dictionary with Authorization header.
        """
        timestamp = str(int(time.time()))
        body_hash = self.hash_body(body)
        signature = self.sign(method, path, timestamp, body_hash)
        return {"Authorization": f"HMAC {self._key_id}:{timestamp}:{signature}"}


class RSASigner(Signer):
    """RSA-based signer for MAP Protocol requests."""

    def __init__(self, private_key_pem: str, key_id: str):
        """
        Initialize the RSA signer.

        Args:
            private_key_pem: The RSA private key in PEM format.
            key_id: The key identifier.
        """
        self._key_id = key_id
        self._private_key_pem = private_key_pem
        self._crypto = __import__(
            "cryptography.hazmat.primitives.asymmetric.padding", fromlist=["PKCS1v15"]
        )
        self._hash = __import__(
            "cryptography.hazmat.primitives.hashes", fromlist=["SHA256"]
        )
        self._serialization = __import__(
            "cryptography.hazmat.primitives.serialization",
            fromlist=["load_pem_private_key"],
        )
        self._base64 = __import__("base64")

    @property
    def key_id(self) -> str:
        """Get the key identifier."""
        return self._key_id

    def _get_private_key(self):
        """Load and return the private key."""
        return self._serialization.load_pem_private_key(
            self._private_key_pem.encode("utf-8"), password=None
        )

    def sign(self, method: str, path: str, timestamp: str, body_hash: str) -> str:
        """
        Create an RSA signature for a request.

        Args:
            method: HTTP method (GET, POST, etc.).
            path: Request path.
            timestamp: Unix timestamp string.
            body_hash: Hash of the request body.

        Returns:
            Base64-encoded signature.
        """
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        message = f"{method}\n{path}\n{timestamp}\n{body_hash}"
        private_key = self._get_private_key()
        signature = private_key.sign(
            message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256()
        )
        return base64.b64encode(signature).decode("utf-8")

    def hash_body(self, body: Optional[str]) -> str:
        """
        Create a SHA-256 hash of the request body.

        Args:
            body: Request body as a string.

        Returns:
            Hex-encoded hash.
        """
        if not body:
            return ""
        import hashlib

        return hashlib.sha256(body.encode("utf-8")).hexdigest()

    def get_authorization_header(
        self,
        method: str,
        path: str,
        body: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        """
        Get the Authorization header for a request.

        Args:
            method: HTTP method.
            path: Request path.
            body: Request body.
            headers: Optional request headers.

        Returns:
            Dictionary with Authorization header.
        """
        timestamp = str(int(time.time()))
        body_hash = self.hash_body(body)
        signature = self.sign(method, path, timestamp, body_hash)
        return {"Authorization": f"RSA {self._key_id}:{timestamp}:{signature}"}


def create_signer(
    key_id: str, secret: Optional[str] = None, private_key_pem: Optional[str] = None
) -> Signer:
    """
    Factory function to create a signer.

    Args:
        key_id: The key identifier.
        secret: The HMAC secret key (for HMAC signing).
        private_key_pem: The RSA private key in PEM format (for RSA signing).

    Returns:
        A Signer instance (HMACSigner or RSASigner).

    Raises:
        ValueError: If neither secret nor private_key_pem is provided.
    """
    if private_key_pem:
        return RSASigner(private_key_pem, key_id)
    if secret:
        return HMACSigner(key_id, secret)
    raise ValueError("Either secret or private_key_pem must be provided")


def create_hmac_signer(key_id: str, secret: str) -> HMACSigner:
    """
    Factory function to create an HMAC signer.

    Args:
        key_id: The key identifier.
        secret: The secret key for signing.

    Returns:
        An HMACSigner instance.
    """
    return HMACSigner(key_id, secret)


def create_rsa_signer(key_id: str, private_key_pem: str) -> RSASigner:
    """
    Factory function to create an RSA signer.

    Args:
        key_id: The key identifier.
        private_key_pem: The RSA private key in PEM format.

    Returns:
        An RSASigner instance.
    """
    return RSASigner(private_key_pem, key_id)
