# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# SPDX-License-Identifier: Apache-2.0
"""
HTTP Signing for MAP Protocol (JWS Compact Serialization).

Implements the same JWS compact serialization format as the TypeScript
reference implementation in `packages/typescript/src/signing-http.ts`.

Format: base64url(header).base64url(payload).base64url(signature)

- typ: "MAPSIG"
- Payload ordering alphabetically: body, key_id, method, path, timestamp
- HMAC-SHA256 (HS256) for signing
- Uses standard base64url encoding (no padding)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from typing import Optional, Tuple


def _stable_stringify(value) -> str:
    """Produce deterministic JSON output by sorting object keys alphabetically.

    This mirrors the TypeScript `stableStringify` in `signing-http.ts`.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        items = [_stable_stringify(item) for item in value]
        return "[" + ",".join(items) + "]"
    if isinstance(value, dict):
        keys = sorted(value.keys())
        pairs = [json.dumps(key) + ":" + _stable_stringify(value[key]) for key in keys]
        return "{" + ",".join(pairs) + "}"
    return json.dumps(value)


def _base64url_encode(data: bytes) -> str:
    """Base64url encode (no padding) matching the TypeScript reference."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class HTTPSigner:
    """HTTP Signer for MAP signed requests using HMAC-SHA256.

    Produces JWS compact serialization with typ: "MAPSIG" matching
    the TypeScript reference implementation in `signing-http.ts`.
    """

    def __init__(self, kid: str, secret: str):
        """Initialize the HTTPSigner.

        Args:
            kid: The key identifier (key_id).
            secret: The HMAC shared secret.
        """
        self._kid = kid
        self._secret = secret.encode("utf-8")
        self._secret_str = secret

    @property
    def kid(self) -> str:
        """Get the key identifier."""
        return self._kid

    def sign_request(
        self,
        method: str,
        path: str,
        timestamp: str,
        body: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        """Sign an HTTP request for MAP Protocol.

        Uses JWS-like compact serialization format:
            base64url(header).base64url(payload).base64url(signature)

        Args:
            method: HTTP method (GET, POST, etc.).
            path: Request path.
            timestamp: ISO 8601 / RFC 3339 timestamp string.
            body: Optional request body as a string.

        Returns:
            Tuple of (signature, body_hash, nonce).
        """
        body_hash = self.hash_body(body)
        nonce = str(uuid.uuid4())

        # Create JWS-like compact serialization header
        header = {
            "alg": "HS256",
            "kid": self._kid,
            "nonce": nonce,
            "typ": "MAPSIG",
        }

        # Payload with fields in the canonical order matching TypeScript reference:
        # body, key_id, method, path, timestamp
        payload = {
            "body": body if body is not None else "",
            "key_id": self._kid,
            "method": method.upper(),
            "path": path,
            "timestamp": timestamp,
        }

        # Base64url encode header and payload using stable serialization
        encoded_header = _base64url_encode(_stable_stringify(header).encode("utf-8"))
        encoded_payload = _base64url_encode(_stable_stringify(payload).encode("utf-8"))

        # Sign the "header.payload" string
        signing_input = f"{encoded_header}.{encoded_payload}"
        h = hmac.new(self._secret, signing_input.encode("utf-8"), hashlib.sha256)
        encoded_signature = _base64url_encode(h.digest())

        # Return full JWS-like signature
        signature = f"{signing_input}.{encoded_signature}"
        return signature, body_hash, nonce

    def hash_body(self, body: Optional[str]) -> str:
        """Hash the request body using HMAC-SHA256.

        Args:
            body: Request body as a string or None.

        Returns:
            Base64url-encoded HMAC hash of the body, or empty string.
        """
        if not body:
            return ""
        h = hmac.new(self._secret, body.encode("utf-8"), hashlib.sha256)
        return _base64url_encode(h.digest())

    def get_authorization_header(
        self,
        method: str,
        path: str,
        timestamp: str,
        body: Optional[str] = None,
    ) -> dict:
        """Get the MAP-Signature header for a request.

        Args:
            method: HTTP method.
            path: Request path.
            timestamp: ISO 8601 / RFC 3339 timestamp string.
            body: Optional request body.

        Returns:
            Dictionary with MAP-Signature header.
        """
        signature, body_hash, nonce = self.sign_request(method, path, timestamp, body)
        return {
            "MAP-Signature": signature,
            "X-MAP-Body-Hash": body_hash,
            "X-MAP-Nonce": nonce,
            "X-MAP-Key-ID": self._kid,
        }
