// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package mapproto

import (
	"testing"
	"time"
)

func TestNewClient(t *testing.T) {
	client, err := NewClient()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected client, got nil")
	}
}

func TestClientOptions(t *testing.T) {
	signer := &testSigner{keyID: "test-key"}

	client, err := NewClient(
		WithBaseURL("https://test.mapprotocol.io"),
		WithTimeout(10*time.Second),
		WithSigner(signer),
	)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected client, got nil")
	}
}

func TestWithSigner(t *testing.T) {
	signer := NewHMACSigner([]byte("secret"), "test-key")

	client, err := NewClient(WithSigner(signer))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected client, got nil")
	}
}

func TestWithTimeout(t *testing.T) {
	client, err := NewClient(WithTimeout(5 * time.Second))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected client, got nil")
	}
}

type testSigner struct {
	keyID string
}

func (s *testSigner) SignRequest(data []byte) (string, error) {
	return "test-signature", nil
}

func (s *testSigner) KeyID() string {
	return s.keyID
}

func TestDispatchRequest(t *testing.T) {
	req := DispatchRequest{
		Envelope: TaskEnvelope{
			ID: "test-task-1",
			Requester: RequesterIdentity{
				Address: "0x1234",
				ChainID: "ethereum",
			},
			Constraints: TaskConstraints{
				MaxBudget:   "100",
				MaxDuration: 60,
				RiskLevel:   RiskLevelLow,
			},
			Payload:   []byte("test payload"),
			CreatedAt: time.Now().Unix(),
			ExpiresAt: time.Now().Add(1 * time.Hour).Unix(),
		},
	}

	if req.Envelope.ID != "test-task-1" {
		t.Errorf("expected task ID 'test-task-1', got '%s'", req.Envelope.ID)
	}
	if req.Envelope.Requester.Address != "0x1234" {
		t.Errorf("expected address '0x1234', got '%s'", req.Envelope.Requester.Address)
	}
	if req.Envelope.Constraints.RiskLevel != RiskLevelLow {
		t.Errorf("expected risk level 'low', got '%s'", req.Envelope.Constraints.RiskLevel)
	}
}

func TestGetTask(t *testing.T) {
	t.Skip("requires mock server")
}

func TestListTasks(t *testing.T) {
	t.Skip("requires mock server")
}

func TestListAgents(t *testing.T) {
	t.Skip("requires mock server")
}

func TestApprove(t *testing.T) {
	t.Skip("requires mock server")
}

func TestGetHealth(t *testing.T) {
	t.Skip("requires mock server")
}

func TestAPIError(t *testing.T) {
	apiErr := APIError{
		Code:      ErrCodeInvalidRequest,
		Message:   "invalid request body",
		Retryable: false,
	}

	expected := "invalid_request: invalid request body"
	if apiErr.Error() != expected {
		t.Errorf("expected error message '%s', got '%s'", expected, apiErr.Error())
	}
}

func TestMapError(t *testing.T) {
	mapErr := &MapError{
		Code:    ErrCodeInternalError,
		Message: "internal server error",
		Err:     ErrTimeout,
	}

	if mapErr.Error() != "internal_error: internal server error: request timeout" {
		t.Errorf("unexpected error message: %s", mapErr.Error())
	}

	if !mapErr.Is(ErrTimeout) {
		t.Error("expected error to unwrap to ErrTimeout")
	}
}

func TestSignerInterface(t *testing.T) {
	var _ Signer = (*HMACSigner)(nil)
	var _ Signer = (*RSASigner)(nil)
}

func TestClientDispatch(t *testing.T) {
	t.Skip("integration test - requires running server")
}

func TestContextCancellation(t *testing.T) {
	t.Skip("integration test - requires running server")
}

func TestSignerKeyID(t *testing.T) {
	signer := NewHMACSigner([]byte("secret"), "chain:address")
	if signer.KeyID() != "chain:address" {
		t.Errorf("expected key ID 'chain:address', got '%s'", signer.KeyID())
	}
}
