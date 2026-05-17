// MAP Protocol - Micro Agent Protocol
//
// Copyright © 2026 Sidian Labs
// SPDX-License-Identifier: Apache-2.0

// SPDX-License-Identifier: Apache-2.0

package mapproto

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"testing"
	"time"
)

func TestHMACSignerSign(t *testing.T) {
	secret := []byte("test-secret-key")
	signer := NewHMACSigner(secret, "chain:address")

	tests := []struct {
		name      string
		method    string
		path      string
		body      string
		timestamp string
	}{
		{
			name:      "GET request",
			method:    "GET",
			path:      "/v1/tasks",
			body:      "",
			timestamp: "2024-01-01T00:00:00Z",
		},
		{
			name:      "POST request with body",
			method:    "POST",
			path:      "/v1/tasks/dispatch",
			body:      `{"capability":"test"}`,
			timestamp: "2024-01-01T00:00:00Z",
		},
		{
			name:      "PUT request",
			method:    "PUT",
			path:      "/v1/tasks/123",
			body:      `{"status":"running"}`,
			timestamp: "2024-01-01T12:00:00Z",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sig, err := signer.Sign(tt.method, tt.path, tt.body, tt.timestamp)
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if sig == "" {
				t.Fatal("expected signature, got empty")
			}

			// Verify signature is valid base64
			_, err = base64.StdEncoding.DecodeString(sig)
			if err != nil {
				t.Errorf("signature is not valid base64: %v", err)
			}

			// Verify same inputs produce same signature
			sig2, err := signer.Sign(tt.method, tt.path, tt.body, tt.timestamp)
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if sig != sig2 {
				t.Error("expected same inputs to produce same signature")
			}
		})
	}
}

func TestHMACSignerDifferentInputs(t *testing.T) {
	signer := NewHMACSigner([]byte("secret"), "chain:address")

	sig1, _ := signer.Sign("GET", "/v1/test", "{}", "2024-01-01T00:00:00Z")
	sig2, _ := signer.Sign("POST", "/v1/test", "{}", "2024-01-01T00:00:00Z")
	sig3, _ := signer.Sign("GET", "/v1/other", "{}", "2024-01-01T00:00:00Z")
	sig4, _ := signer.Sign("GET", "/v1/test", `{"different":true}`, "2024-01-01T00:00:00Z")
	sig5, _ := signer.Sign("GET", "/v1/test", "{}", "2024-01-02T00:00:00Z")

	// Different inputs should produce different signatures
	if sig1 == sig2 {
		t.Error("different methods should produce different signatures")
	}
	if sig1 == sig3 {
		t.Error("different paths should produce different signatures")
	}
	if sig1 == sig4 {
		t.Error("different bodies should produce different signatures")
	}
	if sig1 == sig5 {
		t.Error("different timestamps should produce different signatures")
	}
}

func TestHMACSignerGetKeyID(t *testing.T) {
	tests := []struct {
		keyID    string
		expected string
	}{
		{"chain:address", "chain:address"},
		{"ethereum:0x1234", "ethereum:0x1234"},
		{"solana:abc123", "solana:abc123"},
	}

	for _, tt := range tests {
		t.Run(tt.keyID, func(t *testing.T) {
			signer := NewHMACSigner([]byte("secret"), tt.keyID)
			if signer.GetKeyID() != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, signer.GetKeyID())
			}
		})
	}
}

func TestRSASignerSign(t *testing.T) {
	// Generate a real RSA key for testing
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}

	// Encode to PEM
	pemBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	pemKey := string(pemBytes)

	signer, err := NewRSASigner(pemKey, "chain:address")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	tests := []struct {
		name      string
		method    string
		path      string
		body      string
		timestamp string
	}{
		{
			name:      "GET request",
			method:    "GET",
			path:      "/v1/tasks",
			body:      "",
			timestamp: "2024-01-01T00:00:00Z",
		},
		{
			name:      "POST request with body",
			method:    "POST",
			path:      "/v1/tasks/dispatch",
			body:      `{"capability":"test"}`,
			timestamp: "2024-01-01T00:00:00Z",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sig, err := signer.Sign(tt.method, tt.path, tt.body, tt.timestamp)
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if sig == "" {
				t.Fatal("expected signature, got empty")
			}

			// Verify signature is valid base64
			decoded, err := base64.StdEncoding.DecodeString(sig)
			if err != nil {
				t.Errorf("signature is not valid base64: %v", err)
			}

			// Verify signature length is reasonable for RSA 2048
			if len(decoded) != 256 {
				t.Errorf("expected signature length 256, got %d", len(decoded))
			}
		})
	}
}

func TestRSASignerDifferentInputs(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}
	pemBytes := x509.MarshalPKCS1PrivateKey(privateKey)

	signer, err := NewRSASigner(string(pemBytes), "chain:address")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	sig1, _ := signer.Sign("GET", "/v1/test", "{}", "2024-01-01T00:00:00Z")
	sig2, _ := signer.Sign("POST", "/v1/test", "{}", "2024-01-01T00:00:00Z")
	sig3, _ := signer.Sign("GET", "/v1/other", "{}", "2024-01-01T00:00:00Z")
	sig4, _ := signer.Sign("GET", "/v1/test", `{"different":true}`, "2024-01-01T00:00:00Z")
	sig5, _ := signer.Sign("GET", "/v1/test", "{}", "2024-01-02T00:00:00Z")

	// Different inputs should produce different signatures
	if sig1 == sig2 {
		t.Error("different methods should produce different signatures")
	}
	if sig1 == sig3 {
		t.Error("different paths should produce different signatures")
	}
	if sig1 == sig4 {
		t.Error("different bodies should produce different signatures")
	}
	if sig1 == sig5 {
		t.Error("different timestamps should produce different signatures")
	}
}

func TestRSASignerGetKeyID(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}
	pemBytes := x509.MarshalPKCS1PrivateKey(privateKey)

	tests := []struct {
		keyID    string
		expected string
	}{
		{"chain:address", "chain:address"},
		{"ethereum:0x1234", "ethereum:0x1234"},
	}

	for _, tt := range tests {
		t.Run(tt.keyID, func(t *testing.T) {
			signer, err := NewRSASigner(string(pemBytes), tt.keyID)
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if signer.GetKeyID() != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, signer.GetKeyID())
			}
		})
	}
}

func TestRSASignerInvalidKey(t *testing.T) {
	tests := []struct {
		name  string
		pem   string
		keyID string
	}{
		{
			name:  "empty PEM",
			pem:   "",
			keyID: "test",
		},
		{
			name:  "invalid PEM",
			pem:   "not-a-valid-pem",
			keyID: "test",
		},
		{
			name:  "wrong header",
			pem:   "-----BEGIN RSA PUBLIC KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PUBLIC KEY-----",
			keyID: "test",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewRSASigner(tt.pem, tt.keyID)
			if err == nil {
				t.Error("expected error for invalid key")
			}
		})
	}
}

func TestRSASignerPKCS8(t *testing.T) {
	// Generate a real RSA key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}

	// Convert to PKCS8
	pkcs8Bytes, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatalf("failed to marshal PKCS8: %v", err)
	}

	pemKey := "-----BEGIN PRIVATE KEY-----\n" + base64.StdEncoding.EncodeToString(pkcs8Bytes) + "\n-----END PRIVATE KEY-----"

	signer, err := NewRSASigner(pemKey, "chain:address")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	sig, err := signer.Sign("GET", "/v1/test", "{}", "2024-01-01T00:00:00Z")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if sig == "" {
		t.Fatal("expected signature, got empty")
	}
}

func TestSignerFuncInterface(t *testing.T) {
	fn := SignerFunc(func(method, path, body, timestamp string) (string, error) {
		return "test-signature", nil
	})

	if fn.GetKeyID() != "" {
		t.Errorf("expected empty key ID, got '%s'", fn.GetKeyID())
	}

	sig, err := fn.Sign("GET", "/test", "{}", "2024-01-01T00:00:00Z")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if sig != "test-signature" {
		t.Errorf("expected 'test-signature', got '%s'", sig)
	}
}

func TestSignerFuncError(t *testing.T) {
	expectedErr := errTestSign
	fn := SignerFunc(func(method, path, body, timestamp string) (string, error) {
		return "", expectedErr
	})

	_, err := fn.Sign("GET", "/test", "{}", "2024-01-01T00:00:00Z")
	if err != expectedErr {
		t.Errorf("expected error %v, got %v", expectedErr, err)
	}
}

var errTestSign = &testSignError{}

type testSignError struct{}

func (e *testSignError) Error() string {
	return "test sign error"
}

func TestSignRequest(t *testing.T) {
	signer := NewHMACSigner([]byte("secret"), "chain:address")

	headers, err := SignRequest(signer, "POST", "/v1/test", `{"test": true}`)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if headers.XMapAuthScheme != "signed_request" {
		t.Errorf("expected 'signed_request', got '%s'", headers.XMapAuthScheme)
	}
	if headers.XMapKeyID != "chain:address" {
		t.Errorf("expected 'chain:address', got '%s'", headers.XMapKeyID)
	}
	if headers.XMapTimestamp == "" {
		t.Fatal("expected timestamp, got empty")
	}
	if headers.XMapRequestSignature == "" {
		t.Fatal("expected signature, got empty")
	}

	// Verify signature is valid base64
	_, err = base64.StdEncoding.DecodeString(headers.XMapRequestSignature)
	if err != nil {
		t.Errorf("signature is not valid base64: %v", err)
	}
}

func TestParseKeyID(t *testing.T) {
	tests := []struct {
		input         string
		expectedChain string
		expectedAddr  string
		expectError   bool
	}{
		{"chain:address", "chain", "address", false},
		{"ethereum:0x1234", "ethereum", "0x1234", false},
		{"solana:abc123", "solana", "abc123", false},
		{"", "", "", true},
		{"no-colon", "", "", true},
		{"too:many:colons", "", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			chainID, address, err := ParseKeyID(tt.input)
			if tt.expectError {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if chainID != tt.expectedChain {
				t.Errorf("expected chain '%s', got '%s'", tt.expectedChain, chainID)
			}
			if address != tt.expectedAddr {
				t.Errorf("expected address '%s', got '%s'", tt.expectedAddr, address)
			}
		})
	}
}

func TestFormatKeyID(t *testing.T) {
	tests := []struct {
		chain    string
		address  string
		expected string
	}{
		{"chain", "address", "chain:address"},
		{"ethereum", "0x1234", "ethereum:0x1234"},
		{"solana", "abc123", "solana:abc123"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			result := FormatKeyID(tt.chain, tt.address)
			if result != tt.expected {
				t.Errorf("expected '%s', got '%s'", tt.expected, result)
			}
		})
	}
}

func TestGenerateTimestamp(t *testing.T) {
	ts := GenerateTimestamp()
	if ts == "" {
		t.Fatal("expected timestamp, got empty")
	}

	// Should be parseable as time
	_, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		t.Errorf("expected valid RFC3339 timestamp, got '%s': %v", ts, err)
	}
}

func TestSignatureConsistency(t *testing.T) {
	signer := NewHMACSigner([]byte("consistent-secret"), "chain:address")

	// Sign the same request multiple times
	sigs := make([]string, 5)
	for i := 0; i < 5; i++ {
		sig, err := signer.Sign("POST", "/v1/tasks/dispatch", `{"capability":"test"}`, "2024-01-01T00:00:00Z")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		sigs[i] = sig
	}

	// All signatures should be identical
	for i := 1; i < len(sigs); i++ {
		if sigs[i] != sigs[0] {
			t.Errorf("signature %d differs from signature 0", i)
		}
	}
}

func TestHMACvsRSASignature(t *testing.T) {
	// HMAC signer
	hmacSigner := NewHMACSigner([]byte("secret"), "chain:address")

	// RSA signer
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}
	pemBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	rsaSigner, err := NewRSASigner(string(pemBytes), "chain:address")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	method := "POST"
	path := "/v1/test"
	body := `{"test":true}`
	timestamp := "2024-01-01T00:00:00Z"

	hmacSig, _ := hmacSigner.Sign(method, path, body, timestamp)
	rsaSig, _ := rsaSigner.Sign(method, path, body, timestamp)

	// Both should produce signatures
	if hmacSig == "" {
		t.Fatal("expected HMAC signature")
	}
	if rsaSig == "" {
		t.Fatal("expected RSA signature")
	}

	// Signatures should be different (different algorithms)
	if hmacSig == rsaSig {
		t.Error("HMAC and RSA signatures should be different")
	}

	// Both should be valid base64
	_, err = base64.StdEncoding.DecodeString(hmacSig)
	if err != nil {
		t.Errorf("HMAC signature is not valid base64: %v", err)
	}
	_, err = base64.StdEncoding.DecodeString(rsaSig)
	if err != nil {
		t.Errorf("RSA signature is not valid base64: %v", err)
	}
}
