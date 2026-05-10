# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol signing utilities.
"""

import pytest

from mapprotocol.signing import (
    HMACSigner,
    RSASigner,
    create_hmac_signer,
    create_rsa_signer,
    create_signer,
)

# Valid RSA private key for testing (2048-bit)
VALID_RSA_KEY = """-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA8UOpk7hkT6sMKIt11uSL2fdCw9xhbgyrJvmoVoANda5g1Ue2
aUXZeh2M5vz1cdcz5KtfWh89hQ5gWVrD6SGtrTHebRZb7DVEy87Wxj/JrWrwKQK9
Cco2GN1WPLes2ZGs5PebVgt93TmXwENDwDEM/1RScc6mlIvYWGmCEqRh1d8cETWV
A4VwnncLR5KXyiuMJNvsssuXqmzAXjPb5FS2R5Bl8CGKC4rlJKaWq272ZscuL9bi
ArdZGciem/Ijf3e9ke+Wywh9P73RgYTw5H1HIjbkWERinB0p/oEXVbG45M73L6/l
3FzwPWyQ2Q/dq/Z6YWesI4iB1N7dm8eT2KqeRQIDAQABAoIBABPNdRyXV2sZ7oML
bgN9Oc9iVfwOhCliEnropf0Hlf3mmghs0kI8xfdvIn1jyN+XBX7g5BAucpW6aC/I
B+mEO/r0a2hycTQSQTsl7IdUKAEQacrr8HPebDyej4anSswxgp/pL4+gnNbsybxc
U7IcNJARLefXyYt1bln/ZaToZ3wEIxFQwnFF4PBKE993hpIDAcNlMNLaxMEPknmF
lK62JrclNP/WZ2Nv816X8LequHeGELkXt+XMaFWlktUBZCklNbIpr+Ku+hf7f4Mn
24hefBYCRcmQAzfi3Mxp/St8bK/ZdrGbV6O84V9b++rNYzCvhyFToQQHzsXhz2a3
ZU+OYsECgYEA/ziXQyb4FUVp0HRgTwc204mL+wrexKXlApWNtuejknhNZV/ZJQRt
ASTI+Nn8qJH/sJb3ZxJrUjYm8LQdEpmCyvHU9riac2epBR0NMrrypwDLAnjP3jT1
Qpt3lEEfqw4VeO0pSsOqhRfuGsgkrk+Q+Lz9Xrm2SEpfCzfF2o8klmECgYEA8gAq
t4OvOT+zZN6Za4x+BiMZfUs0miugaFyC+xnbd7bd+bdgH7YLkcCODaTdVnkiH7dj
uGLDPG82YuoM7hFdsfic7VunuK/9R+A59/l9V4HIuemFsS7YC5co0KOXx9HAiNyD
Q0Nwzx+v0Nca2w7SGh1rPvAnvUOPmcOWSzALimUCgYEAp+olqurCocwPeDR5AMWw
TrDaRgq60gqLh425tTLlrYI0+ZN8HByzUuNOzlstHgMghKBumYPG1EoIiKkXz5rs
MHW3NbPy+iajT1fzzQKujy24YyH1MS8Khg4fOI04NqSHgA4Y8rWVRQefgkNXzs9O
hDhjQqVQxnMX4RuKsucmnUECgYEA027342xnLIKOTyP5MTEHbn8+Ju0NIWHafTPO
sGqQCFE6MZJYpnwcMZTlx9/yDjo5aTKGKrQHVgboopVRBLMhhHvtR6gbqs4AYcrz
esd9DnZzFJOF3h9KXR4NZ/R2iPum1yyqdps2tZA+wR0e9qNFR9HKQKv8XGzpyvNK
nZh1jM0CgYBP7GrehDa8qDdbFh9lRUWjkf2M424oyjZsSkNVCdQZNdEA6fkgwEPX
XoxiqPxMaa88Bkm9vGIuybL8NQqG8X2QpZWn6ghI1zqZBJBMzsawTR3HqgbrbaC/
8jJYjH3CRFZSsZxFHtrV7Ny+4OK7P9INVQeS8h7179jbbJoS5t5Rgg==
-----END RSA PRIVATE KEY-----"""


class TestHMACSigner:
    """Tests for HMACSigner class."""

    def test_signer_initialization(self):
        """Test signer can be initialized."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        assert signer.key_id == "test-key"

    def test_hash_body(self):
        """Test body hashing."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        body = '{"key": "value"}'
        hash_result = signer.hash_body(body)
        assert isinstance(hash_result, str)
        assert len(hash_result) == 64

    def test_hash_body_empty(self):
        """Test body hashing with empty body."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        hash_result = signer.hash_body(None)
        assert hash_result == ""

    def test_sign(self):
        """Test signing with timestamp and body hash."""
        signer = HMACSigner(key_id="test-key", secret="test-secret")
        signature = signer.sign(
            method="GET", path="/tasks", timestamp="1234567890", body_hash="abc123"
        )
        assert isinstance(signature, str)

    def test_get_authorization_header(self):
        """Test getting authorization header."""
        signer = HMACSigner(key_id="my-key-id", secret="my-secret")
        auth_header = signer.get_authorization_header(method="GET", path="/health")
        assert "Authorization" in auth_header
        # New format includes timestamp: HMAC key_id:timestamp:signature
        assert auth_header["Authorization"].startswith("HMAC my-key-id:")


class TestRSASigner:
    """Tests for RSASigner class."""

    def test_rsa_signer_initialization(self):
        """Test RSA signer can be initialized."""
        signer = RSASigner(private_key_pem=VALID_RSA_KEY, key_id="rsa-key-1")
        assert signer.key_id == "rsa-key-1"

    def test_rsa_sign(self):
        """Test RSA signing with timestamp and body hash."""
        signer = RSASigner(private_key_pem=VALID_RSA_KEY, key_id="rsa-key-1")
        signature = signer.sign(
            method="GET", path="/tasks", timestamp="1234567890", body_hash="abc123"
        )
        assert isinstance(signature, str)

    def test_rsa_hash_body(self):
        """Test RSA body hashing."""
        signer = RSASigner(private_key_pem=VALID_RSA_KEY, key_id="rsa-key-1")
        body = '{"key": "value"}'
        hash_result = signer.hash_body(body)
        assert isinstance(hash_result, str)
        assert len(hash_result) == 64

    def test_rsa_get_authorization_header(self):
        """Test getting RSA authorization header."""
        signer = RSASigner(private_key_pem=VALID_RSA_KEY, key_id="rsa-key-1")
        auth_header = signer.get_authorization_header(method="GET", path="/health")
        assert "Authorization" in auth_header
        assert auth_header["Authorization"].startswith("RSA rsa-key-1:")


class TestCreateSigner:
    """Tests for create_signer factory function."""

    def test_create_hmac_signer(self):
        """Test factory returns HMACSigner when secret is provided."""
        signer = create_signer(key_id="key", secret="secret")
        assert isinstance(signer, HMACSigner)
        assert signer.key_id == "key"

    def test_create_signer_with_different_credentials(self):
        """Test factory with different credentials."""
        signer1 = create_signer(key_id="key1", secret="secret1")
        signer2 = create_signer(key_id="key2", secret="secret2")
        assert signer1.key_id != signer2.key_id

    def test_create_rsa_signer_function(self):
        """Test create_rsa_signer factory function."""
        signer = create_rsa_signer(key_id="rsa-key", private_key_pem=VALID_RSA_KEY)
        assert isinstance(signer, RSASigner)
        assert signer.key_id == "rsa-key"

    def test_create_signer_rsa_mode(self):
        """Test factory returns RSASigner when private_key_pem is provided."""
        signer = create_signer(key_id="key", private_key_pem=VALID_RSA_KEY)
        assert isinstance(signer, RSASigner)


class TestSignerInterface:
    """Tests for the Signer interface."""

    def test_signer_interface_implementation(self):
        """Test that both signers implement the Signer interface."""
        from mapprotocol.signing import Signer

        hmac_signer = create_signer(key_id="key", secret="secret")
        assert isinstance(hmac_signer, Signer)
        assert hasattr(hmac_signer, "key_id")
        assert hasattr(hmac_signer, "sign")
        assert hasattr(hmac_signer, "hash_body")
