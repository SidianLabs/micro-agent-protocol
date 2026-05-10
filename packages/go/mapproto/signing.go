// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package mapproto

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
)

type Signer interface {
	SignRequest(data []byte) (string, error)
	KeyID() string
}

type HMACSigner struct {
	secret []byte
	keyID  string
}

func NewHMACSigner(secret []byte, keyID string) *HMACSigner {
	return &HMACSigner{
		secret: secret,
		keyID:  keyID,
	}
}

func (s *HMACSigner) KeyID() string {
	return s.keyID
}

func (s *HMACSigner) SignRequest(data []byte) (string, error) {
	h := sha256.New()
	h.Write(data)
	h.Write(s.secret)
	signature := h.Sum(nil)
	return base64.StdEncoding.EncodeToString(signature), nil
}

type RSASigner struct {
	privateKey *rsa.PrivateKey
	keyID      string
}

func NewRSASigner(privateKeyPEM string, keyID string) (*RSASigner, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	if block.Type != "RSA PRIVATE KEY" && block.Type != "PRIVATE KEY" {
		return nil, fmt.Errorf("invalid private key type: %s", block.Type)
	}

	var err error
	var privateKey *rsa.PrivateKey

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

	return &RSASigner{
		privateKey: privateKey,
		keyID:      keyID,
	}, nil
}

func (s *RSASigner) KeyID() string {
	return s.keyID
}

func (s *RSASigner) SignRequest(data []byte) (string, error) {
	hashed := sha256.Sum256(data)
	signature, err := rsa.SignPKCS1v15(rand.Reader, s.privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign: %w", err)
	}
	return base64.StdEncoding.EncodeToString(signature), nil
}

type SignerFunc func(data []byte) (string, error)

func (f SignerFunc) SignRequest(data []byte) (string, error) {
	return f(data)
}

func (f SignerFunc) KeyID() string {
	return ""
}

func ParseKeyID(keyID string) (chainID, address string, err error) {
	parts := strings.Split(keyID, ":")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid key ID format: expected chainID:address")
	}
	return parts[0], parts[1], nil
}

func FormatKeyID(chainID, address string) string {
	return fmt.Sprintf("%s:%s", chainID, address)
}
