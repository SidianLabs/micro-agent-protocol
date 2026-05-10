// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

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
	"encoding/pem"
	"fmt"
	"strings"
	"time"
)

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

// Sign creates an HMAC signature for the request
func (s *HMACSigner) Sign(method, path, body, timestamp string) (string, error) {
	// Format: "MAP\0{method}\0{path}\0{timestamp}\0{body_hash}"
	bodyHash := sha256.Sum256([]byte(body))
	message := fmt.Sprintf("MAP\x00%s\x00%s\x00%s\x00%s",
		strings.ToUpper(method),
		path,
		timestamp,
		hex.EncodeToString(bodyHash[:]),
	)

	h := hmac.New(sha256.New, s.secret)
	h.Write([]byte(message))
	signature := h.Sum(nil)

	return base64.StdEncoding.EncodeToString(signature), nil
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

// Sign creates an RSA signature for the request
func (s *RSASigner) Sign(method, path, body, timestamp string) (string, error) {
	// Format: "MAP\0{method}\0{path}\0{timestamp}\0{body_hash}"
	bodyHash := sha256.Sum256([]byte(body))
	message := fmt.Sprintf("MAP\x00%s\x00%s\x00%s\x00%s",
		strings.ToUpper(method),
		path,
		timestamp,
		hex.EncodeToString(bodyHash[:]),
	)

	hashed := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, s.privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign: %w", err)
	}

	return base64.StdEncoding.EncodeToString(signature), nil
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
	}, nil
}
