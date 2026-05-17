// MAP Protocol - Micro Agent Protocol
//
// Copyright © 2026 Sidian Labs
// SPDX-License-Identifier: Apache-2.0

// SPDX-License-Identifier: Apache-2.0

package mapproto

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ---- Client Tests ----

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
		WithBaseURL("http://localhost:8787"),
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

func TestWithTransport(t *testing.T) {
	transport := NewHTTPTransport(nil)
	client, err := NewClient(WithTransport(transport))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected client, got nil")
	}
}

func TestWithHeaderFunc(t *testing.T) {
	fn := func(req *http.Request) {
		req.Header.Set("X-Custom-Header", "test")
	}

	client, err := NewClient(WithHeaderFunc(fn))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected client, got nil")
	}
	if client.headerFunc == nil {
		t.Fatal("expected header function to be stored")
	}
}

// ---- Signer Interface Tests ----

type testSigner struct {
	keyID string
}

func (s *testSigner) Sign(method, path, body, timestamp string) (string, error) {
	return "test-signature", nil
}

func (s *testSigner) GetKeyID() string {
	return s.keyID
}

func TestSignerInterface(t *testing.T) {
	var _ Signer = (*HMACSigner)(nil)
	var _ Signer = (*RSASigner)(nil)
	var _ Signer = (*testSigner)(nil)
}

func TestHMACSigner(t *testing.T) {
	signer := NewHMACSigner([]byte("secret"), "chain:address")
	if signer.GetKeyID() != "chain:address" {
		t.Errorf("expected key ID 'chain:address', got '%s'", signer.GetKeyID())
	}

	sig, err := signer.Sign("GET", "/test", `{}`, "2024-01-01T00:00:00Z")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if sig == "" {
		t.Fatal("expected signature, got empty")
	}
}

func TestRSASigner(t *testing.T) {
	_, err := NewRSASigner("invalid", "test-key")
	if err == nil {
		t.Fatal("expected error for invalid key")
	}
}

func TestSignerFunc(t *testing.T) {
	fn := SignerFunc(func(method, path, body, timestamp string) (string, error) {
		return "test", nil
	})

	if fn.GetKeyID() != "" {
		t.Errorf("expected empty key ID, got '%s'", fn.GetKeyID())
	}

	sig, err := fn.Sign("GET", "/test", "{}", "2024-01-01T00:00:00Z")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if sig != "test" {
		t.Errorf("expected 'test', got '%s'", sig)
	}
}

// ---- Key ID Parsing Tests ----

// ---- DispatchRequest Tests ----

func TestDispatchRequestConstruction(t *testing.T) {
	req := &DispatchRequest{
		Capability: "test-capability",
		Envelope: TaskEnvelope{
			TaskID:    "test-task-1",
			Intent:    "Test intent",
			RiskClass: RiskLevelLow,
			RequesterIdentity: RequesterIdentity{
				Type: "user",
				ID:   "user-123",
			},
			TargetAgent: "agent-456",
			Constraints: TaskConstraints{
				Common: &CommonConstraints{
					Environment: EnvironmentProduction,
					MaxAmount:   100.0,
				},
			},
			DelegationToken:     "delegation-token",
			RequestedOutputMode: VisibilityModeFull,
		},
		Negotiation: &InvocationNegotiationRequest{
			DeliveryMode: DeliveryModeSync,
		},
	}

	if req.Capability != "test-capability" {
		t.Errorf("expected capability 'test-capability', got '%s'", req.Capability)
	}
	if req.Envelope.TaskID != "test-task-1" {
		t.Errorf("expected task ID 'test-task-1', got '%s'", req.Envelope.TaskID)
	}
	if req.Envelope.RiskClass != RiskLevelLow {
		t.Errorf("expected risk class 'low', got '%s'", req.Envelope.RiskClass)
	}
	if req.Envelope.RequesterIdentity.Type != "user" {
		t.Errorf("expected requester type 'user', got '%s'", req.Envelope.RequesterIdentity.Type)
	}
	if req.Negotiation == nil {
		t.Fatal("expected negotiation, got nil")
	}
	if req.Negotiation.DeliveryMode != DeliveryModeSync {
		t.Errorf("expected delivery mode 'sync', got '%s'", req.Negotiation.DeliveryMode)
	}
}

// ---- ApprovalRequest Tests ----

func TestApprovalRequestConstruction(t *testing.T) {
	req := &ApprovalRequest{
		TaskID:            "task-123",
		ApprovalReference: "approval-ref",
		Capability:        "test-capability",
		Envelope: TaskEnvelope{
			TaskID:    "test-task-1",
			Intent:    "Test intent",
			RiskClass: RiskLevelMedium,
			RequesterIdentity: RequesterIdentity{
				Type: "service",
				ID:   "service-456",
			},
			TargetAgent: "agent-789",
			Constraints: TaskConstraints{
				Common: &CommonConstraints{
					Environment: EnvironmentStaging,
				},
			},
			DelegationToken:     "delegation-token",
			RequestedOutputMode: VisibilityModeStructuredOnly,
		},
	}

	if req.TaskID != "task-123" {
		t.Errorf("expected task ID 'task-123', got '%s'", req.TaskID)
	}
	if req.ApprovalReference != "approval-ref" {
		t.Errorf("expected approval reference 'approval-ref', got '%s'", req.ApprovalReference)
	}
}

// ---- TaskRecord Tests ----

func TestTaskRecordConstruction(t *testing.T) {
	record := &TaskRecord{
		TaskID: "task-123",
		RequesterIdentity: RequesterIdentity{
			Type:     "agent",
			ID:       "agent-456",
			TenantID: "tenant-789",
		},
		Capability:  "test-capability",
		TargetAgent: "target-agent",
		Status:      TaskStatusRunning,
		UpdatedAt:   "2024-01-01T12:00:00Z",
	}

	if record.TaskID != "task-123" {
		t.Errorf("expected task ID 'task-123', got '%s'", record.TaskID)
	}
	if record.Status != TaskStatusRunning {
		t.Errorf("expected status 'running', got '%s'", record.Status)
	}
	if record.RequesterIdentity.TenantID != "tenant-789" {
		t.Errorf("expected tenant ID 'tenant-789', got '%s'", record.RequesterIdentity.TenantID)
	}
}

// ---- HealthStatus Tests ----

func TestHealthStatusConstruction(t *testing.T) {
	status := &HealthStatus{
		Status: "healthy",
		Version: VersionInfo{
			Protocol:  "1.0.0",
			Schema:    "1.0.0",
			Transport: "http",
		},
		UptimeMs: 3600000,
		Checks: map[string]HealthCheck{
			"database": {
				Status:    HealthCheckStatusPass,
				Timestamp: "2024-01-01T12:00:00Z",
			},
		},
	}

	if status.Status != "healthy" {
		t.Errorf("expected status 'healthy', got '%s'", status.Status)
	}
	if status.Version.Protocol != "1.0.0" {
		t.Errorf("expected protocol '1.0.0', got '%s'", status.Version.Protocol)
	}
	if status.Checks["database"].Status != HealthCheckStatusPass {
		t.Errorf("expected database check status 'pass', got '%s'", status.Checks["database"].Status)
	}
}

// ---- Error Tests ----

func TestMapAPIError(t *testing.T) {
	apiErr := NewMapAPIError(ErrorCodeInvalidRequest, "invalid request body")

	expected := "invalid_request: invalid request body"
	if apiErr.Error() != expected {
		t.Errorf("expected error message '%s', got '%s'", expected, apiErr.Error())
	}

	if apiErr.Code != ErrorCodeInvalidRequest {
		t.Errorf("expected code 'invalid_request', got '%s'", apiErr.Code)
	}

	if apiErr.IsRetryable() {
		t.Error("expected error to not be retryable")
	}
}

func TestMapError(t *testing.T) {
	mapErr := NewMapError(ErrorCodeInternalError, "internal server error", true, 500)

	if mapErr.Error() != "internal_error: internal server error" {
		t.Errorf("unexpected error message: %s", mapErr.Error())
	}

	if !mapErr.GetRetryable() {
		t.Error("expected error to be retryable")
	}

	if mapErr.GetStatus() != 500 {
		t.Errorf("expected status 500, got %d", mapErr.GetStatus())
	}
}

func TestParseHTTPError(t *testing.T) {
	// Test 404 error
	rec := httptest.NewRecorder()
	rec.WriteHeader(http.StatusNotFound)
	resp := rec.Result()

	apiErr := ParseHTTPError(resp)
	if apiErr == nil {
		t.Fatal("expected error, got nil")
	}
	if apiErr.Code != ErrorCodeResourceNotFound {
		t.Errorf("expected 'resource_not_found', got '%s'", apiErr.Code)
	}
}

func TestErrorConstants(t *testing.T) {
	// Verify error constants exist
	if ErrNotFound == nil {
		t.Error("ErrNotFound should not be nil")
	}
	if ErrTimeout == nil {
		t.Error("ErrTimeout should not be nil")
	}
	if ErrTaskNotFound == nil {
		t.Error("ErrTaskNotFound should not be nil")
	}
	if ErrAgentNotFound == nil {
		t.Error("ErrAgentNotFound should not be nil")
	}
}

// ---- Type Constants Tests ----

func TestRiskLevelConstants(t *testing.T) {
	if RiskLevelLow != "low" {
		t.Errorf("expected 'low', got '%s'", RiskLevelLow)
	}
	if RiskLevelMedium != "medium" {
		t.Errorf("expected 'medium', got '%s'", RiskLevelMedium)
	}
	if RiskLevelHigh != "high" {
		t.Errorf("expected 'high', got '%s'", RiskLevelHigh)
	}
	if RiskLevelCritical != "critical" {
		t.Errorf("expected 'critical', got '%s'", RiskLevelCritical)
	}
}

func TestExecutionModeConstants(t *testing.T) {
	modes := []ExecutionMode{
		ExecutionModeRead,
		ExecutionModeAnalyze,
		ExecutionModePropose,
		ExecutionModeCommit,
		ExecutionModeMonitor,
		ExecutionModeBatch,
	}
	expected := []string{"read", "analyze", "propose", "commit", "monitor", "batch"}

	for i, mode := range modes {
		if mode != ExecutionMode(expected[i]) {
			t.Errorf("expected '%s', got '%s'", expected[i], mode)
		}
	}
}

func TestVisibilityModeConstants(t *testing.T) {
	modes := []VisibilityMode{
		VisibilityModeFull,
		VisibilityModeSummary,
		VisibilityModeStructuredOnly,
		VisibilityModeReceiptOnly,
		VisibilityModeRedacted,
		VisibilityModeDebug,
	}
	expected := []string{"full", "summary", "structured_only", "receipt_only", "redacted", "debug"}

	for i, mode := range modes {
		if mode != VisibilityMode(expected[i]) {
			t.Errorf("expected '%s', got '%s'", expected[i], mode)
		}
	}
}

func TestTaskStatusConstants(t *testing.T) {
	statuses := []TaskStatus{
		TaskStatusAccepted,
		TaskStatusProposed,
		TaskStatusAwaitingApproval,
		TaskStatusDenied,
		TaskStatusRunning,
		TaskStatusCompleted,
		TaskStatusFailed,
		TaskStatusRevoked,
	}
	expected := []string{"accepted", "proposed", "awaiting_approval", "denied", "running", "completed", "failed", "revoked"}

	for i, status := range statuses {
		if status != TaskStatus(expected[i]) {
			t.Errorf("expected '%s', got '%s'", expected[i], status)
		}
	}
}

func TestErrorCodeConstants(t *testing.T) {
	codes := []ErrorCode{
		ErrorCodeAgentNotFound,
		ErrorCodeAgentDisabled,
		ErrorCodeCapabilityNotFound,
		ErrorCodePolicyDenied,
		ErrorCodeApprovalRequired,
		ErrorCodeRateLimitExceeded,
		ErrorCodeInternalError,
		ErrorCodeInvalidRequest,
	}

	for _, code := range codes {
		if code == "" {
			t.Error("error code should not be empty")
		}
		// Verify status and retryable maps have entries
		if _, ok := ErrorCodeStatusMap[code]; !ok {
			t.Errorf("missing status for code %s", code)
		}
		if _, ok := ErrorCodeRetryableMap[code]; !ok {
			t.Errorf("missing retryable for code %s", code)
		}
	}
}

func TestAuthSchemeConstants(t *testing.T) {
	schemes := []AuthScheme{
		AuthSchemeNone,
		AuthSchemeBearer,
		AuthSchemeMTLS,
		AuthSchemeSignedRequest,
	}
	expected := []string{"none", "bearer", "mtls", "signed_request"}

	for i, scheme := range schemes {
		if scheme != AuthScheme(expected[i]) {
			t.Errorf("expected '%s', got '%s'", expected[i], scheme)
		}
	}
}

func TestDeliveryModeConstants(t *testing.T) {
	if DeliveryModeSync != "sync" {
		t.Errorf("expected 'sync', got '%s'", DeliveryModeSync)
	}
	if DeliveryModeAsync != "async" {
		t.Errorf("expected 'async', got '%s'", DeliveryModeAsync)
	}
}

func TestResultModeConstants(t *testing.T) {
	if ResultModeOk != "ok" {
		t.Errorf("expected 'ok', got '%s'", ResultModeOk)
	}
	if ResultModeError != "error" {
		t.Errorf("expected 'error', got '%s'", ResultModeError)
	}
}

// ---- Pagination Tests ----

func TestNewPagination(t *testing.T) {
	p := NewPagination()
	if p == nil {
		t.Fatal("expected pagination, got nil")
	}
	if p.Limit != 20 {
		t.Errorf("expected limit 20, got %d", p.Limit)
	}
	if p.NextCursor != "" {
		t.Errorf("expected empty cursor, got '%s'", p.NextCursor)
	}
}

func TestPaginatedResultConstruction(t *testing.T) {
	result := &PaginatedResult[TaskRecord]{
		Items: []TaskRecord{
			{TaskID: "task-1", Status: TaskStatusRunning},
			{TaskID: "task-2", Status: TaskStatusCompleted},
		},
		Pagination: Pagination{
			Limit:      20,
			NextCursor: "cursor-123",
			Total:      100,
		},
	}

	if len(result.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(result.Items))
	}
	if result.Pagination.Total != 100 {
		t.Errorf("expected total 100, got %d", result.Pagination.Total)
	}
}

// ---- AgentDescriptor Tests ----

func TestAgentDescriptorConstruction(t *testing.T) {
	agent := &AgentDescriptor{
		AgentID:         "agent-123",
		Organization:    "test-org",
		Version:         "1.0.0",
		Domain:          "test.domain",
		Capabilities:    []string{"capability-1", "capability-2"},
		RiskLevel:       RiskLevelMedium,
		InputSchemaRef:  "schema-input",
		OutputSchemaRef: "schema-output",
		SupportedExecutionModes: []ExecutionMode{
			ExecutionModeRead,
			ExecutionModeAnalyze,
		},
		VisibilityModes: []VisibilityMode{
			VisibilityModeFull,
			VisibilityModeSummary,
		},
		Tags: []string{"tag1", "tag2"},
	}

	if agent.AgentID != "agent-123" {
		t.Errorf("expected agent ID 'agent-123', got '%s'", agent.AgentID)
	}
	if len(agent.Capabilities) != 2 {
		t.Errorf("expected 2 capabilities, got %d", len(agent.Capabilities))
	}
	if agent.RiskLevel != RiskLevelMedium {
		t.Errorf("expected risk level 'medium', got '%s'", agent.RiskLevel)
	}
}

// ---- JSON Marshaling Tests ----

func TestDispatchRequestJSON(t *testing.T) {
	req := &DispatchRequest{
		Capability: "test-capability",
		Envelope: TaskEnvelope{
			TaskID:    "test-task-1",
			Intent:    "Test intent",
			RiskClass: RiskLevelLow,
			RequesterIdentity: RequesterIdentity{
				Type: "user",
				ID:   "user-123",
			},
			TargetAgent:         "agent-456",
			Constraints:         TaskConstraints{},
			DelegationToken:     "token",
			RequestedOutputMode: VisibilityModeFull,
		},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	var decoded DispatchRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if decoded.Capability != req.Capability {
		t.Errorf("expected capability '%s', got '%s'", req.Capability, decoded.Capability)
	}
	if decoded.Envelope.TaskID != req.Envelope.TaskID {
		t.Errorf("expected task ID '%s', got '%s'", req.Envelope.TaskID, decoded.Envelope.TaskID)
	}
}

func TestTaskRecordJSON(t *testing.T) {
	record := &TaskRecord{
		TaskID: "task-123",
		RequesterIdentity: RequesterIdentity{
			Type: "agent",
			ID:   "agent-456",
		},
		Capability:  "capability",
		TargetAgent: "target",
		Status:      TaskStatusCompleted,
		UpdatedAt:   "2024-01-01T00:00:00Z",
	}

	data, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	var decoded TaskRecord
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if decoded.Status != TaskStatusCompleted {
		t.Errorf("expected status 'completed', got '%s'", decoded.Status)
	}
}

// ---- ResultPackage Tests ----

func TestResultPackageConstruction(t *testing.T) {
	result := &ResultPackage{
		TaskID:  "task-123",
		Status:  TaskStatusCompleted,
		Summary: "Task completed successfully",
		StructuredOutput: map[string]any{
			"result": "data",
		},
		FollowupRequired: false,
	}

	if result.TaskID != "task-123" {
		t.Errorf("expected task ID 'task-123', got '%s'", result.TaskID)
	}
	if result.Status != TaskStatusCompleted {
		t.Errorf("expected status 'completed', got '%s'", result.Status)
	}
	if result.FollowupRequired {
		t.Error("expected followup not required")
	}
}

// ---- ExecutionReceipt Tests ----

func TestExecutionReceiptConstruction(t *testing.T) {
	receipt := &ExecutionReceipt{
		ReceiptID:       "receipt-123",
		TaskID:          "task-456",
		AgentID:         "agent-789",
		ActionTaken:     "action",
		ResourceTouched: "resource",
		PolicyChecks:    []string{"policy-1", "policy-2"},
		Timestamp:       "2024-01-01T12:00:00Z",
		ResultHash:      "hash123",
		Signature:       "signature",
	}

	if receipt.ReceiptID != "receipt-123" {
		t.Errorf("expected receipt ID 'receipt-123', got '%s'", receipt.ReceiptID)
	}
	if len(receipt.PolicyChecks) != 2 {
		t.Errorf("expected 2 policy checks, got %d", len(receipt.PolicyChecks))
	}
}

// ---- Integration Test Helpers ----

func TestContextCancellation(t *testing.T) {
	t.Skip("integration test - requires running server")
}

func TestClientDispatch(t *testing.T) {
	t.Skip("integration test - requires running server")
}

// ---- Key ID Parsing Tests ----

func TestInvokeResultConstruction(t *testing.T) {
	result := &InvokeResult{
		Result: ResultPackage{
			TaskID: "task-123",
			Status: TaskStatusCompleted,
			StructuredOutput: map[string]any{
				"output": "data",
			},
			FollowupRequired: false,
		},
		Receipt: &ExecutionReceipt{
			ReceiptID: "receipt-123",
			TaskID:    "task-123",
			AgentID:   "agent-456",
		},
	}

	if result.Result.TaskID != "task-123" {
		t.Errorf("expected task ID 'task-123', got '%s'", result.Result.TaskID)
	}
	if result.Receipt == nil {
		t.Fatal("expected receipt, got nil")
	}
	if result.Receipt.ReceiptID != "receipt-123" {
		t.Errorf("expected receipt ID 'receipt-123', got '%s'", result.Receipt.ReceiptID)
	}
}

// ---- MapResponse Tests ----

func TestMapResponseConstruction(t *testing.T) {
	resp := &MapResponse[TaskRecord]{
		OK:        ResultModeOk,
		RequestID: "req-123",
		Data: &TaskRecord{
			TaskID: "task-456",
			Status: TaskStatusRunning,
		},
	}

	if resp.OK != ResultModeOk {
		t.Errorf("expected 'ok', got '%s'", resp.OK)
	}
	if resp.Data == nil {
		t.Fatal("expected data, got nil")
	}
}

func TestMapResponseError(t *testing.T) {
	resp := &MapResponse[TaskRecord]{
		OK: ResultModeError,
		Error: &MapErrorResponse{
			Code:      ErrorCodeInvalidRequest,
			Message:   "invalid request",
			Retryable: false,
			Status:    400,
		},
	}

	if resp.OK != ResultModeError {
		t.Errorf("expected 'error', got '%s'", resp.OK)
	}
	if resp.Error == nil {
		t.Fatal("expected error, got nil")
	}
	if resp.Error.Code != ErrorCodeInvalidRequest {
		t.Errorf("expected code 'invalid_request', got '%s'", resp.Error.Code)
	}
}

// ---- Transport Tests ----

func TestHTTPTransportRetry(t *testing.T) {
	transport := NewHTTPTransport(nil, WithRetryEnabled(true), WithMaxRetries(3))
	if transport == nil {
		t.Fatal("expected transport, got nil")
	}
	if !transport.RetryEnabled {
		t.Error("expected retry to be enabled")
	}
	if transport.MaxRetries != 3 {
		t.Errorf("expected 3 max retries, got %d", transport.MaxRetries)
	}
}

func TestHTTPTransportNoRetry(t *testing.T) {
	transport := NewHTTPTransport(nil, WithRetryEnabled(false))
	if transport == nil {
		t.Fatal("expected transport, got nil")
	}
	if transport.RetryEnabled {
		t.Error("expected retry to be disabled")
	}
}

func TestRoundTripFunc(t *testing.T) {
	called := false
	fn := RoundTripFunc(func(req *http.Request) (*http.Response, error) {
		called = true
		return &http.Response{StatusCode: 200}, nil
	})

	req := httptest.NewRequest("GET", "/test", nil)
	_, err := fn.RoundTrip(req)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if !called {
		t.Error("expected RoundTripFunc to be called")
	}
}

// ---- TaskConstraints Tests ----

func TestTaskConstraintsConstruction(t *testing.T) {
	constraints := &TaskConstraints{
		Common: &CommonConstraints{
			ResourceID:     "resource-123",
			Environment:    EnvironmentProduction,
			MaxAmount:      100.0,
			Currency:       "USD",
			RedactionLevel: RedactionLevelBasic,
		},
		Domain: map[string]any{
			"custom": "value",
		},
	}

	if constraints.Common == nil {
		t.Fatal("expected common constraints, got nil")
	}
	if constraints.Common.ResourceID != "resource-123" {
		t.Errorf("expected resource ID 'resource-123', got '%s'", constraints.Common.ResourceID)
	}
	if constraints.Common.Environment != EnvironmentProduction {
		t.Errorf("expected environment 'production', got '%s'", constraints.Common.Environment)
	}
}

// ---- DelegationToken Tests ----

func TestDelegationTokenConstruction(t *testing.T) {
	token := &DelegationToken{
		Issuer:         "issuer-123",
		SubjectAgent:   "agent-456",
		AllowedActions: []string{"action1", "action2"},
		ResourceScope: map[string]any{
			"scope": "value",
		},
		Constraints: &DelegationConstraints{
			ExpiresAt: "2024-12-31T23:59:59Z",
		},
		Signature: "signature",
	}

	if token.Issuer != "issuer-123" {
		t.Errorf("expected issuer 'issuer-123', got '%s'", token.Issuer)
	}
	if len(token.AllowedActions) != 2 {
		t.Errorf("expected 2 allowed actions, got %d", len(token.AllowedActions))
	}
	if token.Constraints == nil {
		t.Fatal("expected constraints, got nil")
	}
}

// ---- ValidationError Tests ----

func TestValidationErrorConstruction(t *testing.T) {
	err := NewValidationError("field", "is required", ErrorCodeInvalidRequest)
	if err.Field != "field" {
		t.Errorf("expected field 'field', got '%s'", err.Field)
	}
	if err.Message != "is required" {
		t.Errorf("expected message 'is required', got '%s'", err.Message)
	}
	if err.Code != ErrorCodeInvalidRequest {
		t.Errorf("expected code 'invalid_request', got '%s'", err.Code)
	}
}

func TestMapValidationError(t *testing.T) {
	merr := &MapValidationError{}
	merr.AddValidationError("field1", "error 1", ErrorCodeInvalidRequest)
	merr.AddValidationError("field2", "error 2", ErrorCodeSchemaValidationFailed)

	if len(merr.Errors) != 2 {
		t.Errorf("expected 2 errors, got %d", len(merr.Errors))
	}

	expected := "validation failed: field1: error 1, field2: error 2"
	if merr.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, merr.Error())
	}
}

func TestEmptyMapValidationError(t *testing.T) {
	merr := &MapValidationError{}
	if merr.Error() != "validation failed" {
		t.Errorf("expected 'validation failed', got '%s'", merr.Error())
	}
}

// ---- PolicyDecision Tests ----

func TestPolicyDecisionConstruction(t *testing.T) {
	decision := &PolicyDecision{
		Allowed:      true,
		Action:       "allow",
		PolicyChecks: []string{"check1", "check2"},
		Reason:       "allowed by policy",
	}

	if !decision.Allowed {
		t.Error("expected allowed to be true")
	}
	if decision.Action != "allow" {
		t.Errorf("expected action 'allow', got '%s'", decision.Action)
	}
	if len(decision.PolicyChecks) != 2 {
		t.Errorf("expected 2 policy checks, got %d", len(decision.PolicyChecks))
	}
}

// ---- VersionNegotiation Tests ----

func TestVersionNegotiationConstruction(t *testing.T) {
	vn := &VersionNegotiation{
		ClientVersion:       "1.0.0",
		ServerVersion:       "1.0.0",
		SelectedVersion:     "1.0.0",
		Compatible:          true,
		NegotiationStrategy: "strict",
		SupportedVersions:   []string{"1.0.0", "1.1.0"},
	}

	if !vn.Compatible {
		t.Error("expected compatible to be true")
	}
	if vn.SelectedVersion != "1.0.0" {
		t.Errorf("expected selected version '1.0.0', got '%s'", vn.SelectedVersion)
	}
}

// ---- CommonConstraints Tests ----

func TestTimeWindowConstruction(t *testing.T) {
	tw := &TimeWindow{
		Start: "2024-01-01T00:00:00Z",
		End:   "2024-12-31T23:59:59Z",
	}

	if tw.Start != "2024-01-01T00:00:00Z" {
		t.Errorf("expected start '2024-01-01T00:00:00Z', got '%s'", tw.Start)
	}
}

func TestRedactionLevelConstants(t *testing.T) {
	if RedactionLevelNone != "none" {
		t.Errorf("expected 'none', got '%s'", RedactionLevelNone)
	}
	if RedactionLevelBasic != "basic" {
		t.Errorf("expected 'basic', got '%s'", RedactionLevelBasic)
	}
	if RedactionLevelStrict != "strict" {
		t.Errorf("expected 'strict', got '%s'", RedactionLevelStrict)
	}
}

func TestEnvironmentConstants(t *testing.T) {
	if EnvironmentDevelopment != "development" {
		t.Errorf("expected 'development', got '%s'", EnvironmentDevelopment)
	}
	if EnvironmentStaging != "staging" {
		t.Errorf("expected 'staging', got '%s'", EnvironmentStaging)
	}
	if EnvironmentProduction != "production" {
		t.Errorf("expected 'production', got '%s'", EnvironmentProduction)
	}
}

// ---- RegistryStatus Tests ----

func TestRegistryStatusConstants(t *testing.T) {
	if RegistryStatusActive != "active" {
		t.Errorf("expected 'active', got '%s'", RegistryStatusActive)
	}
	if RegistryStatusDeprecated != "deprecated" {
		t.Errorf("expected 'deprecated', got '%s'", RegistryStatusDeprecated)
	}
	if RegistryStatusDisabled != "disabled" {
		t.Errorf("expected 'disabled', got '%s'", RegistryStatusDisabled)
	}
}

// ---- HealthCheckStatus Tests ----

func TestHealthCheckStatusConstants(t *testing.T) {
	if HealthCheckStatusPass != "pass" {
		t.Errorf("expected 'pass', got '%s'", HealthCheckStatusPass)
	}
	if HealthCheckStatusFail != "fail" {
		t.Errorf("expected 'fail', got '%s'", HealthCheckStatusFail)
	}
	if HealthCheckStatusWarn != "warn" {
		t.Errorf("expected 'warn', got '%s'", HealthCheckStatusWarn)
	}
}

// ---- ErrorCategory Tests ----

func TestErrorCategoryConstants(t *testing.T) {
	if ErrorCategoryValidation != "validation" {
		t.Errorf("expected 'validation', got '%s'", ErrorCategoryValidation)
	}
	if ErrorCategoryAuthentication != "authentication" {
		t.Errorf("expected 'authentication', got '%s'", ErrorCategoryAuthentication)
	}
	if ErrorCategoryAuthorization != "authorization" {
		t.Errorf("expected 'authorization', got '%s'", ErrorCategoryAuthorization)
	}
	if ErrorCategoryNotFound != "not_found" {
		t.Errorf("expected 'not_found', got '%s'", ErrorCategoryNotFound)
	}
	if ErrorCategoryConflict != "conflict" {
		t.Errorf("expected 'conflict', got '%s'", ErrorCategoryConflict)
	}
	if ErrorCategoryRateLimit != "rate_limit" {
		t.Errorf("expected 'rate_limit', got '%s'", ErrorCategoryRateLimit)
	}
	if ErrorCategoryServer != "server" {
		t.Errorf("expected 'server', got '%s'", ErrorCategoryServer)
	}
	if ErrorCategoryClient != "client" {
		t.Errorf("expected 'client', got '%s'", ErrorCategoryClient)
	}
}

// ---- DescriptorSignatureAlg Tests ----

func TestDescriptorSignatureAlgConstants(t *testing.T) {
	if DescriptorSignatureAlgHS256 != "HS256" {
		t.Errorf("expected 'HS256', got '%s'", DescriptorSignatureAlgHS256)
	}
	if DescriptorSignatureAlgRS256 != "RS256" {
		t.Errorf("expected 'RS256', got '%s'", DescriptorSignatureAlgRS256)
	}
}

// ---- TranslationTarget Tests ----

func TestTranslationTargetConstruction(t *testing.T) {
	tt := &TranslationTarget{
		From: "schema-a",
		To:   "schema-b",
		Mode: "provider_translation",
	}

	if tt.From != "schema-a" {
		t.Errorf("expected 'schema-a', got '%s'", tt.From)
	}
	if tt.Mode != "provider_translation" {
		t.Errorf("expected 'provider_translation', got '%s'", tt.Mode)
	}
}

// ---- CapabilityDescriptor Tests ----

func TestCapabilityDescriptorConstruction(t *testing.T) {
	cd := &CapabilityDescriptor{
		Name:              ExecutionModeRead,
		ExecutionMode:     ExecutionModeRead,
		RequestSchemaRef:  "request-schema",
		ResponseSchemaRef: "response-schema",
	}

	if cd.Name != ExecutionModeRead {
		t.Errorf("expected 'read', got '%s'", cd.Name)
	}
}

// ---- TransportBinding Tests ----

func TestTransportBindingConstruction(t *testing.T) {
	tb := &TransportBinding{
		Kind:     "http",
		Endpoint: "https://example.com",
	}

	if tb.Kind != "http" {
		t.Errorf("expected 'http', got '%s'", tb.Kind)
	}
	if tb.Endpoint != "https://example.com" {
		t.Errorf("expected 'https://example.com', got '%s'", tb.Endpoint)
	}
}

// ---- MapSignedRequestHeaders Tests ----

func TestMapSignedRequestHeadersConstruction(t *testing.T) {
	h := &MapSignedRequestHeaders{
		XMapAuthScheme:       "signed_request",
		XMapKeyID:            "key-id",
		XMapTimestamp:        "timestamp",
		XMapRequestSignature: "signature",
	}

	if h.XMapAuthScheme != "signed_request" {
		t.Errorf("expected 'signed_request', got '%s'", h.XMapAuthScheme)
	}
	if h.XMapKeyID != "key-id" {
		t.Errorf("expected 'key-id', got '%s'", h.XMapKeyID)
	}
}

// ---- InvocationNegotiation Tests ----

func TestInvocationNegotiationConstruction(t *testing.T) {
	neg := &InvocationNegotiation{
		Requested: &NegotiationRequested{
			OutputMode:   VisibilityModeFull,
			DeliveryMode: DeliveryModeSync,
		},
		Selected: &NegotiationSelected{
			OutputMode:   VisibilityModeFull,
			DeliveryMode: DeliveryModeSync,
		},
		ProviderActions: []string{"schema_translated"},
	}

	if neg.Requested.OutputMode != VisibilityModeFull {
		t.Errorf("expected 'full', got '%s'", neg.Requested.OutputMode)
	}
	if len(neg.ProviderActions) != 1 {
		t.Errorf("expected 1 provider action, got %d", len(neg.ProviderActions))
	}
}

// ---- PaginatedRequest Tests ----

func TestPaginatedRequestConstruction(t *testing.T) {
	pr := &PaginatedRequest{
		Limit:  50,
		Cursor: "cursor-123",
	}

	if pr.Limit != 50 {
		t.Errorf("expected 50, got %d", pr.Limit)
	}
	if pr.Cursor != "cursor-123" {
		t.Errorf("expected 'cursor-123', got '%s'", pr.Cursor)
	}
}

// ---- Query Params Tests ----

func TestTaskQueryParamsConstruction(t *testing.T) {
	q := &TaskQueryParams{
		TenantID:    "tenant-123",
		Status:      TaskStatusRunning,
		Capability:  "capability",
		TargetAgent: "agent",
		Limit:       25,
		Cursor:      "cursor",
	}

	if q.TenantID != "tenant-123" {
		t.Errorf("expected 'tenant-123', got '%s'", q.TenantID)
	}
	if q.Status != TaskStatusRunning {
		t.Errorf("expected 'running', got '%s'", q.Status)
	}
}

func TestAgentsQueryParamsConstruction(t *testing.T) {
	q := &AgentsQueryParams{
		Domain:       "domain",
		Capability:   "capability",
		Organization: "org",
		Limit:        25,
		Cursor:       "cursor",
	}

	if q.Domain != "domain" {
		t.Errorf("expected 'domain', got '%s'", q.Domain)
	}
	if q.Organization != "org" {
		t.Errorf("expected 'org', got '%s'", q.Organization)
	}
}

// ---- Options Tests ----

func TestGetTaskOptionsConstruction(t *testing.T) {
	opts := &GetTaskOptions{
		TenantID: "tenant-123",
	}

	if opts.TenantID != "tenant-123" {
		t.Errorf("expected 'tenant-123', got '%s'", opts.TenantID)
	}
}

func TestListTasksOptionsConstruction(t *testing.T) {
	opts := &ListTasksOptions{
		TenantID:    "tenant-123",
		Status:      TaskStatusCompleted,
		Capability:  "capability",
		TargetAgent: "agent",
		Limit:       50,
		Cursor:      "cursor",
	}

	if opts.TenantID != "tenant-123" {
		t.Errorf("expected 'tenant-123', got '%s'", opts.TenantID)
	}
	if opts.Status != TaskStatusCompleted {
		t.Errorf("expected 'completed', got '%s'", opts.Status)
	}
}

func TestListAgentsOptionsConstruction(t *testing.T) {
	opts := &ListAgentsOptions{
		Domain:       "domain",
		Capability:   "capability",
		Organization: "org",
		Limit:        50,
		Cursor:       "cursor",
	}

	if opts.Domain != "domain" {
		t.Errorf("expected 'domain', got '%s'", opts.Domain)
	}
}

// ---- ErrorContext Tests ----

func TestErrorContextConstruction(t *testing.T) {
	ctx := &ErrorContext{
		Field:         "field",
		Value:         "value",
		SchemaPath:    "/path",
		OriginalError: "original error",
	}

	if ctx.Field != "field" {
		t.Errorf("expected 'field', got '%s'", ctx.Field)
	}
	if ctx.SchemaPath != "/path" {
		t.Errorf("expected '/path', got '%s'", ctx.SchemaPath)
	}
}

// ---- MapRetryableError Tests ----

func TestMapRetryableErrorConstruction(t *testing.T) {
	err := &MapRetryableError{
		Message:        "rate limited",
		RetryAfterMs:   1000,
		RetryAfterSecs: 1.0,
	}

	if err.Message != "rate limited" {
		t.Errorf("expected 'rate limited', got '%s'", err.Message)
	}
	expected := "retryable error: rate limited (retry after 1.0s)"
	if err.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, err.Error())
	}
}

// ---- TaskEnvelope Tests ----

func TestTaskEnvelopeConstruction(t *testing.T) {
	env := &TaskEnvelope{
		TaskID:       "task-123",
		ParentTaskID: "parent-456",
		Intent:       "test intent",
		RiskClass:    RiskLevelHigh,
		Deadline:     "2024-12-31T23:59:59Z",
		Metadata: map[string]any{
			"key": "value",
		},
	}

	if env.TaskID != "task-123" {
		t.Errorf("expected 'task-123', got '%s'", env.TaskID)
	}
	if env.ParentTaskID != "parent-456" {
		t.Errorf("expected 'parent-456', got '%s'", env.ParentTaskID)
	}
	if env.RiskClass != RiskLevelHigh {
		t.Errorf("expected 'high', got '%s'", env.RiskClass)
	}
}

// ---- Negotiation Tests ----

func TestNegotiationRequestedConstruction(t *testing.T) {
	req := &NegotiationRequested{
		SchemaVersion: "1.0.0",
		OutputMode:    VisibilityModeFull,
		DeliveryMode:  DeliveryModeSync,
	}

	if req.SchemaVersion != "1.0.0" {
		t.Errorf("expected '1.0.0', got '%s'", req.SchemaVersion)
	}
	if req.OutputMode != VisibilityModeFull {
		t.Errorf("expected 'full', got '%s'", req.OutputMode)
	}
}

func TestNegotiationSelectedConstruction(t *testing.T) {
	sel := &NegotiationSelected{
		SchemaVersion: "1.0.0",
		OutputMode:    VisibilityModeStructuredOnly,
		DeliveryMode:  DeliveryModeAsync,
	}

	if sel.OutputMode != VisibilityModeStructuredOnly {
		t.Errorf("expected 'structured_only', got '%s'", sel.OutputMode)
	}
	if sel.DeliveryMode != DeliveryModeAsync {
		t.Errorf("expected 'async', got '%s'", sel.DeliveryMode)
	}
}

// ---- InvocationNegotiationRequest Tests ----

func TestInvocationNegotiationRequestConstruction(t *testing.T) {
	req := &InvocationNegotiationRequest{
		SchemaVersion: "1.0.0",
		DeliveryMode:  DeliveryModeSync,
	}

	if req.SchemaVersion != "1.0.0" {
		t.Errorf("expected '1.0.0', got '%s'", req.SchemaVersion)
	}
	if req.DeliveryMode != DeliveryModeSync {
		t.Errorf("expected 'sync', got '%s'", req.DeliveryMode)
	}
}

// ---- DispatchResponse Tests ----

func TestDispatchResponseConstruction(t *testing.T) {
	resp := &DispatchResponse{
		Result: ResultPackage{
			TaskID:           "task-123",
			Status:           TaskStatusCompleted,
			StructuredOutput: map[string]any{"result": "data"},
			FollowupRequired: false,
		},
		Receipt: &ExecutionReceipt{
			ReceiptID: "receipt-123",
			TaskID:    "task-123",
			AgentID:   "agent-456",
		},
	}

	if resp.Result.TaskID != "task-123" {
		t.Errorf("expected 'task-123', got '%s'", resp.Result.TaskID)
	}
	if resp.Receipt == nil {
		t.Fatal("expected receipt, got nil")
	}
}

// ---- ApprovalResponse Tests ----

func TestApprovalResponseConstruction(t *testing.T) {
	resp := &ApprovalResponse{
		Result: ResultPackage{
			TaskID:           "task-123",
			Status:           TaskStatusAccepted,
			StructuredOutput: map[string]any{},
			FollowupRequired: false,
		},
		Receipt: &ExecutionReceipt{
			ReceiptID: "receipt-123",
			TaskID:    "task-123",
			AgentID:   "agent-456",
		},
	}

	if resp.Result.Status != TaskStatusAccepted {
		t.Errorf("expected 'accepted', got '%s'", resp.Result.Status)
	}
}

// ---- PaginatedResult Tests ----

func TestPaginatedResultTasks(t *testing.T) {
	p := &PaginatedTasks{
		Items: []TaskRecord{
			{TaskID: "task-1"},
			{TaskID: "task-2"},
		},
		Pagination: Pagination{
			Limit:      20,
			NextCursor: "next",
			Total:      50,
		},
	}

	if len(p.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(p.Items))
	}
	if p.Pagination.Total != 50 {
		t.Errorf("expected 50, got %d", p.Pagination.Total)
	}
}

func TestPaginatedResultAgents(t *testing.T) {
	p := &PaginatedAgents{
		Items: []AgentDescriptor{
			{AgentID: "agent-1"},
			{AgentID: "agent-2"},
		},
		Pagination: Pagination{
			Limit:      20,
			NextCursor: "next",
			Total:      10,
		},
	}

	if len(p.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(p.Items))
	}
}

// ---- SchemaValidationError Tests ----

func TestSchemaValidationErrorConstruction(t *testing.T) {
	err := &SchemaValidationError{}
	err.Code = ErrorCodeSchemaValidationFailed
	err.Message = "validation failed"
	err.Details.Category = ErrorCategoryValidation
	err.Details.ValidationErrors = []ValidationErrorDetail{
		{Field: "field1", Message: "error1", Code: ErrorCodeInvalidRequest},
	}
	err.Details.SchemaRef = "schema-ref"

	if err.Code != ErrorCodeSchemaValidationFailed {
		t.Errorf("expected 'schema_validation_failed', got '%s'", err.Code)
	}
	if len(err.Details.ValidationErrors) != 1 {
		t.Errorf("expected 1 validation error, got %d", len(err.Details.ValidationErrors))
	}
}

// ---- MapErrorResponse Tests ----

func TestMapErrorResponseConstruction(t *testing.T) {
	resp := &MapErrorResponse{
		Code:      ErrorCodeInvalidRequest,
		Message:   "invalid request",
		Retryable: false,
		Status:    400,
		Details: &ErrorDetails{
			Category: ErrorCategoryValidation,
			Field:    "field",
			Value:    "value",
		},
		RequestID: "req-123",
	}

	if resp.Code != ErrorCodeInvalidRequest {
		t.Errorf("expected 'invalid_request', got '%s'", resp.Code)
	}
	if resp.Details == nil {
		t.Fatal("expected details, got nil")
	}
	if resp.Details.Field != "field" {
		t.Errorf("expected 'field', got '%s'", resp.Details.Field)
	}
}

// ---- VersionInfo Tests ----

func TestVersionInfoConstruction(t *testing.T) {
	vi := &VersionInfo{
		Protocol:  "1.0.0",
		Schema:    "1.0.0",
		Transport: "http",
	}

	if vi.Protocol != "1.0.0" {
		t.Errorf("expected '1.0.0', got '%s'", vi.Protocol)
	}
}

// ---- HealthCheck Tests ----

func TestHealthCheckConstruction(t *testing.T) {
	hc := &HealthCheck{
		Status:    HealthCheckStatusPass,
		Message:   "OK",
		Timestamp: "2024-01-01T12:00:00Z",
	}

	if hc.Status != HealthCheckStatusPass {
		t.Errorf("expected 'pass', got '%s'", hc.Status)
	}
	if hc.Message != "OK" {
		t.Errorf("expected 'OK', got '%s'", hc.Message)
	}
}

// ---- ErrorDetails Tests ----

func TestErrorDetailsConstruction(t *testing.T) {
	ed := &ErrorDetails{
		Category: ErrorCategoryValidation,
		Field:    "field",
		Value:    "value",
		Context:  map[string]any{"ctx": "value"},
	}

	if ed.Category != ErrorCategoryValidation {
		t.Errorf("expected 'validation', got '%s'", ed.Category)
	}
	if ed.Field != "field" {
		t.Errorf("expected 'field', got '%s'", ed.Field)
	}
	if ed.Context == nil {
		t.Fatal("expected context, got nil")
	}
}
