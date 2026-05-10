# SPDX-License-Identifier: Apache-2.0
"""
HMAC signing utilities for MAP Protocol.
"""

from __future__ import annotations

import hmac
import hashlib
import base64
from typing import Optional, Dict, Any


class HMACSigner:
    """HMAC-based signer for MAP Protocol requests."""

    def __init__(self, key_id: str, secret: str):
        """
        Initialize the signer.

        Args:
            key_id: The key identifier.
            secret: The secret key for signing.
        """
        self.key_id = key_id
        self.secret = secret.encode("utf-8")

    def sign(self, method: str, path: str, body: Optional[str] = None, headers: Optional[Dict[str, str]] = None) -> str:
        """
        Create an HMAC signature for a request.

        Args:
            method: HTTP method (GET, POST, etc.).
            path: Request path.
            body: Request body (JSON string).
            headers: Optional request headers.

        Returns:
            Base64-encoded signature.
        """
        components = [method.upper(), path]

        if body:
            components.append(self.hash_body(body))

        if headers:
            sorted_headers = sorted(headers.items())
            header_string = "\n".join(f"{k}:{v}" for k, v in sorted_headers)
            components.append(header_string)

        message = "\n".join(components)
        signature = hmac.new(self.secret, message.encode("utf-8"), hashlib.sha256)
        return base64.b64encode(signature.digest()).decode("utf-8")

    def hash_body(self, body: str) -> str:
        """
        Create a SHA-256 hash of the request body.

        Args:
            body: Request body as a string.

        Returns:
            Hex-encoded hash.
        """
        return hashlib.sha256(body.encode("utf-8")).hexdigest()

    def get_authorization_header(self, method: str, path: str, body: Optional[str] = None, headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
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
        signature = self.sign(method, path, body, headers)
        return {
            "Authorization": f"HMAC {self.key_id}:{signature}"
        }


def create_signer(key_id: str, secret: str) -> HMACSigner:
    """
    Factory function to create an HMAC signer.

    Args:
        key_id: The key identifier.
        secret: The secret key for signing.

    Returns:
        An HMACSigner instance.
    """
    return HMACSigner(key_id, secret)
