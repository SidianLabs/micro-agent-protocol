// MAP Protocol - Micro Agent Protocol
//
// Copyright © 2026 Sidian Labs
// SPDX-License-Identifier: Apache-2.0

// SPDX-License-Identifier: Apache-2.0

package mapproto

import (
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"strings"
	"time"
)

// SigningHeader is the JWS compact serialization header.
// It is JSON-marshaled and base64url-encoded as the first segment.
type SigningHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	Typ string `json:"typ"`
}

// SigningPayload is the JWS compact serialization payload.
// Fields MUST be declared in alphabetical order (body, key_id, method, path, timestamp)
// because Go's encoding/json marshals struct fields in declaration order,
// and the reference implementation requires canonicalized key ordering.
type SigningPayload struct {
	Body      string `json:"body"`
	KeyID     string `json:"key_id"`
	Method    string `json:"method"`
	Path      string `json:"path"`
	Timestamp string `json:"timestamp"`
}

// SigningKey holds the key material needed to produce a compact signature.
// Exactly one of Secret (for HMAC/HS256) or PrivateKey (for RSA/RS256) must be set.
type SigningKey struct {
	Kid        string          // key identifier
	Alg        string          // "HS256" or "RS256"
	Secret     []byte          // HMAC symmetric secret
	PrivateKey *rsa.PrivateKey // RSA private key
}

// createCompactSignature produces a JWS compact serialization string:
//
//	base64url(header).base64url(payload).base64url(signature)
//
// The signature is HMAC-SHA256 or RSA-SHA256 over the first two segments.
func createCompactSignature(payload SigningPayload, signingKey SigningKey) (string, error) {
	header := SigningHeader{
		Alg: signingKey.Alg,
		Kid: signingKey.Kid,
		Typ: "MAPSIG",
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("failed to marshal signing header: %w", err)
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal signing payload: %w", err)
	}

	encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadJSON)
	signingInput := encodedHeader + "." + encodedPayload

	var signatureBytes []byte

	switch signingKey.Alg {
	case "HS256":
		h := hmac.New(sha256.New, signingKey.Secret)
		h.Write([]byte(signingInput))
		signatureBytes = h.Sum(nil)

	case "RS256":
		if signingKey.PrivateKey == nil {
			return "", fmt.Errorf("RS256 signing key has no private key")
		}
		hashed := sha256.Sum256([]byte(signingInput))
		sig, err := rsa.SignPKCS1v15(rand.Reader, signingKey.PrivateKey, crypto.SHA256, hashed[:])
		if err != nil {
			return "", fmt.Errorf("RSA signing failed: %w", err)
		}
		signatureBytes = sig

	default:
		return "", fmt.Errorf("unsupported signing algorithm: %s", signingKey.Alg)
	}

	encodedSignature := base64.RawURLEncoding.EncodeToString(signatureBytes)
	return signingInput + "." + encodedSignature, nil
}

// Signer defines the interface for signing requests
type Signer interface {
	Sign(method, path, body, timestamp string) (string, error)
	GetKeyID() string
}

// HMACSigner implements HMAC-based signing
type HMACSigner struct {
	secret  []byte
	keyID   string
	chainID string
}

// NewHMACSigner creates a new HMAC signer
func NewHMACSigner(secret []byte, keyID string) *HMACSigner {
	parts := strings.Split(keyID, ":")
	chainID := ""
	if len(parts) >= 1 {
		chainID = parts[0]
	}
	return &HMACSigner{
		secret:  secret,
		keyID:   keyID,
		chainID: chainID,
	}
}

// GetKeyID returns the key ID
func (s *HMACSigner) GetKeyID() string {
	return s.keyID
}

// Sign creates a JWS compact serialization signature for the request.
func (s *HMACSigner) Sign(method, path, body, timestamp string) (string, error) {
	payload := SigningPayload{
		Body:      body,
		KeyID:     s.keyID,
		Method:    strings.ToUpper(method),
		Path:      path,
		Timestamp: timestamp,
	}
	signingKey := SigningKey{
		Kid:    s.keyID,
		Alg:    "HS256",
		Secret: s.secret,
	}
	return createCompactSignature(payload, signingKey)
}

// RSASigner implements RSA-based signing
type RSASigner struct {
	privateKey *rsa.PrivateKey
	keyID      string
	chainID    string
}

// NewRSASigner creates a new RSA signer from a PEM-encoded private key
func NewRSASigner(privateKeyPEM string, keyID string) (*RSASigner, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	if block.Type != "RSA PRIVATE KEY" && block.Type != "PRIVATE KEY" {
		return nil, fmt.Errorf("invalid private key type: %s", block.Type)
	}

	var privateKey *rsa.PrivateKey
	var err error

	if block.Type == "PRIVATE KEY" {
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse PKCS8 key: %w", err)
		}
		var ok bool
		privateKey, ok = key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("not an RSA private key")
		}
	} else {
		privateKey, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse PKCS1 key: %w", err)
		}
	}

	parts := strings.Split(keyID, ":")
	chainID := ""
	if len(parts) >= 1 {
		chainID = parts[0]
	}

	return &RSASigner{
		privateKey: privateKey,
		keyID:      keyID,
		chainID:    chainID,
	}, nil
}

// GetKeyID returns the key ID
func (s *RSASigner) GetKeyID() string {
	return s.keyID
}

// Sign creates a JWS compact serialization signature for the request.
func (s *RSASigner) Sign(method, path, body, timestamp string) (string, error) {
	payload := SigningPayload{
		Body:      body,
		KeyID:     s.keyID,
		Method:    strings.ToUpper(method),
		Path:      path,
		Timestamp: timestamp,
	}
	signingKey := SigningKey{
		Kid:        s.keyID,
		Alg:        "RS256",
		PrivateKey: s.privateKey,
	}
	return createCompactSignature(payload, signingKey)
}

// SignerFunc is a function that implements Signer
type SignerFunc func(method, path, body, timestamp string) (string, error)

// Sign implements the Signer interface
func (f SignerFunc) Sign(method, path, body, timestamp string) (string, error) {
	return f(method, path, body, timestamp)
}

// GetKeyID returns an empty string for SignerFunc
func (f SignerFunc) GetKeyID() string {
	return ""
}

// ParseKeyID parses a key ID in format "chainID:address"
func ParseKeyID(keyID string) (chainID, address string, err error) {
	parts := strings.Split(keyID, ":")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid key ID format: expected chainID:address")
	}
	return parts[0], parts[1], nil
}

// FormatKeyID formats a key ID from chain ID and address
func FormatKeyID(chainID, address string) string {
	return fmt.Sprintf("%s:%s", chainID, address)
}

// GenerateTimestamp generates a timestamp for signing
func GenerateTimestamp() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// GenerateNonce generates a cryptographically random nonce as a hex string.
func GenerateNonce() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback: this should never happen on modern systems
		return hex.EncodeToString([]byte(fmt.Sprintf("%d", time.Now().UnixNano())))
	}
	return hex.EncodeToString(b)
}

// SignRequest signs a request and returns the headers
func SignRequest(signer Signer, method, path, body string) (*MapSignedRequestHeaders, error) {
	timestamp := GenerateTimestamp()
	signature, err := signer.Sign(method, path, body, timestamp)
	if err != nil {
		return nil, err
	}

	return &MapSignedRequestHeaders{
		XMapAuthScheme:       "signed_request",
		XMapKeyID:            signer.GetKeyID(),
		XMapTimestamp:        timestamp,
		XMapRequestSignature: signature,
		XMapNonce:            GenerateNonce(),
	}, nil
}
