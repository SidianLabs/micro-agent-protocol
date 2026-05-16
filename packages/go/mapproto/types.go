// MAP Protocol - Micro Agent Protocol
//
// Copyright © 2026 Sidian Labs
// SPDX-License-Identifier: Apache-2.0

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package mapproto

// RiskLevel represents the risk classification of a task
type RiskLevel string

const (
	RiskLevelLow      RiskLevel = "low"
	RiskLevelMedium   RiskLevel = "medium"
	RiskLevelHigh     RiskLevel = "high"
	RiskLevelCritical RiskLevel = "critical"
)

// ExecutionMode represents how a task should be executed
type ExecutionMode string

const (
	ExecutionModeRead    ExecutionMode = "read"
	ExecutionModeAnalyze ExecutionMode = "analyze"
	ExecutionModePropose ExecutionMode = "propose"
	ExecutionModeCommit  ExecutionMode = "commit"
	ExecutionModeMonitor ExecutionMode = "monitor"
	ExecutionModeBatch   ExecutionMode = "batch"
)

// VisibilityMode represents the output visibility level
type VisibilityMode string

const (
	VisibilityModeFull           VisibilityMode = "full"
	VisibilityModeSummary        VisibilityMode = "summary"
	VisibilityModeStructuredOnly VisibilityMode = "structured_only"
	VisibilityModeReceiptOnly    VisibilityMode = "receipt_only"
	VisibilityModeRedacted       VisibilityMode = "redacted"
	VisibilityModeDebug          VisibilityMode = "debug"
)

// DeliveryMode represents the delivery mode for task execution
type DeliveryMode string

const (
	DeliveryModeSync  DeliveryMode = "sync"
	DeliveryModeAsync DeliveryMode = "async"
)

// TaskStatus represents the current status of a task
type TaskStatus string

const (
	TaskStatusAccepted         TaskStatus = "accepted"
	TaskStatusProposed         TaskStatus = "proposed"
	TaskStatusAwaitingApproval TaskStatus = "awaiting_approval"
	TaskStatusDenied           TaskStatus = "denied"
	TaskStatusRunning          TaskStatus = "running"
	TaskStatusCompleted        TaskStatus = "completed"
	TaskStatusFailed           TaskStatus = "failed"
	TaskStatusRevoked          TaskStatus = "revoked"
)

// AuthScheme represents the authentication scheme
type AuthScheme string

const (
	AuthSchemeNone          AuthScheme = "none"
	AuthSchemeBearer        AuthScheme = "bearer"
	AuthSchemeMTLS          AuthScheme = "mtls"
	AuthSchemeSignedRequest AuthScheme = "signed_request"
)

// ErrorCode represents specific error codes
type ErrorCode string

const (
	ErrorCodeAgentNotFound            ErrorCode = "agent_not_found"
	ErrorCodeAgentDisabled            ErrorCode = "agent_disabled"
	ErrorCodeCapabilityNotFound       ErrorCode = "capability_not_found"
	ErrorCodeCapabilityDisabled       ErrorCode = "capability_disabled"
	ErrorCodePolicyDenied             ErrorCode = "policy_denied"
	ErrorCodeApprovalRequired         ErrorCode = "approval_required"
	ErrorCodeApprovalDenied           ErrorCode = "approval_denied"
	ErrorCodeApprovalExpired          ErrorCode = "approval_expired"
	ErrorCodeInvalidDelegationToken   ErrorCode = "invalid_delegation_token"
	ErrorCodeTokenExpired             ErrorCode = "token_expired"
	ErrorCodeTokenInvalidSignature    ErrorCode = "token_invalid_signature"
	ErrorCodeTokenMissingScope        ErrorCode = "token_missing_scope"
	ErrorCodeSchemaValidationFailed   ErrorCode = "schema_validation_failed"
	ErrorCodeSchemaVersionUnsupported ErrorCode = "schema_version_unsupported"
	ErrorCodeSchemaNegotiationFailed  ErrorCode = "schema_negotiation_failed"
	ErrorCodeTenantMismatch           ErrorCode = "tenant_mismatch"
	ErrorCodeRateLimitExceeded        ErrorCode = "rate_limit_exceeded"
	ErrorCodeRequestTimeout           ErrorCode = "request_timeout"
	ErrorCodeInternalError            ErrorCode = "internal_error"
	ErrorCodeInvalidRequest           ErrorCode = "invalid_request"
	ErrorCodeIdempotencyConflict      ErrorCode = "idempotency_conflict"
	ErrorCodeResourceNotFound         ErrorCode = "resource_not_found"
	ErrorCodeUnauthorized             ErrorCode = "unauthorized"
	ErrorCodeForbidden                ErrorCode = "forbidden"
)

// ErrorCodeStatusMap maps error codes to HTTP status codes
var ErrorCodeStatusMap = map[ErrorCode]int{
	ErrorCodeAgentNotFound:            404,
	ErrorCodeAgentDisabled:            403,
	ErrorCodeCapabilityNotFound:       404,
	ErrorCodeCapabilityDisabled:       403,
	ErrorCodePolicyDenied:             403,
	ErrorCodeApprovalRequired:         202,
	ErrorCodeApprovalDenied:           403,
	ErrorCodeApprovalExpired:          410,
	ErrorCodeInvalidDelegationToken:   401,
	ErrorCodeTokenExpired:             401,
	ErrorCodeTokenInvalidSignature:    401,
	ErrorCodeTokenMissingScope:        403,
	ErrorCodeSchemaValidationFailed:   400,
	ErrorCodeSchemaVersionUnsupported: 400,
	ErrorCodeSchemaNegotiationFailed:  400,
	ErrorCodeTenantMismatch:           400,
	ErrorCodeRateLimitExceeded:        429,
	ErrorCodeRequestTimeout:           408,
	ErrorCodeInternalError:            500,
	ErrorCodeInvalidRequest:           400,
	ErrorCodeIdempotencyConflict:      409,
	ErrorCodeResourceNotFound:         404,
	ErrorCodeUnauthorized:             401,
	ErrorCodeForbidden:                403,
}

// ErrorCodeRetryableMap maps error codes to retryability
var ErrorCodeRetryableMap = map[ErrorCode]bool{
	ErrorCodeAgentNotFound:            false,
	ErrorCodeAgentDisabled:            false,
	ErrorCodeCapabilityNotFound:       false,
	ErrorCodeCapabilityDisabled:       false,
	ErrorCodePolicyDenied:             false,
	ErrorCodeApprovalRequired:         false,
	ErrorCodeApprovalDenied:           false,
	ErrorCodeApprovalExpired:          false,
	ErrorCodeInvalidDelegationToken:   false,
	ErrorCodeTokenExpired:             false,
	ErrorCodeTokenInvalidSignature:    false,
	ErrorCodeTokenMissingScope:        false,
	ErrorCodeSchemaValidationFailed:   false,
	ErrorCodeSchemaVersionUnsupported: false,
	ErrorCodeSchemaNegotiationFailed:  false,
	ErrorCodeTenantMismatch:           false,
	ErrorCodeRateLimitExceeded:        true,
	ErrorCodeRequestTimeout:           true,
	ErrorCodeInternalError:            true,
	ErrorCodeInvalidRequest:           false,
	ErrorCodeIdempotencyConflict:      false,
	ErrorCodeResourceNotFound:         false,
	ErrorCodeUnauthorized:             true,
	ErrorCodeForbidden:                false,
}

// ResultMode represents the result mode type
type ResultMode string

const (
	ResultModeOk    ResultMode = "ok"
	ResultModeError ResultMode = "error"
)

// RequesterIdentity represents who is requesting a task
type RequesterIdentity struct {
	Type     string `json:"type"` // "user" | "service" | "agent"
	ID       string `json:"id"`
	TenantID string `json:"tenant_id,omitempty"`
}

// TimeWindow represents a time range
type TimeWindow struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// RedactionLevel represents the level of redaction
type RedactionLevel string

const (
	RedactionLevelNone   RedactionLevel = "none"
	RedactionLevelBasic  RedactionLevel = "basic"
	RedactionLevelStrict RedactionLevel = "strict"
)

// Environment represents the deployment environment
type Environment string

const (
	EnvironmentDevelopment Environment = "development"
	EnvironmentStaging     Environment = "staging"
	EnvironmentProduction  Environment = "production"
)

// CommonConstraints holds common constraint parameters
type CommonConstraints struct {
	ResourceID       string         `json:"resource_id,omitempty"`
	ResourceIDs      []string       `json:"resource_ids,omitempty"`
	Environment      Environment    `json:"environment,omitempty"`
	MaxAmount        float64        `json:"max_amount,omitempty"`
	Currency         string         `json:"currency,omitempty"`
	Limit            int64          `json:"limit,omitempty"`
	ApprovalRequired bool           `json:"approval_required,omitempty"`
	TimeWindow       *TimeWindow    `json:"time_window,omitempty"`
	RedactionLevel   RedactionLevel `json:"redaction_level,omitempty"`
	Extra            map[string]any `json:"extra,omitempty"`
}

// TaskConstraints holds constraints for task execution
type TaskConstraints struct {
	Common *CommonConstraints `json:"common,omitempty"`
	Domain map[string]any     `json:"domain,omitempty"`
	Extra  map[string]any     `json:"extra,omitempty"`
}

// CapabilityDescriptor describes a capability
type CapabilityDescriptor struct {
	Name                      ExecutionMode       `json:"name"`
	ExecutionMode             ExecutionMode       `json:"execution_mode"`
	RequestSchemaRef          string              `json:"request_schema_ref"`
	ResponseSchemaRef         string              `json:"response_schema_ref"`
	ConstraintSchemaRef       string              `json:"constraint_schema_ref,omitempty"`
	ApprovalRequiredByDefault bool                `json:"approval_required_by_default,omitempty"`
	AuthSchemes               []AuthScheme        `json:"auth_schemes,omitempty"`
	RequiredAuthScheme        AuthScheme          `json:"required_auth_scheme,omitempty"`
	SchemaVersion             string              `json:"schema_version,omitempty"`
	SupportedSchemaVersions   []string            `json:"supported_schema_versions,omitempty"`
	PreferredSchemaVersion    string              `json:"preferred_schema_version,omitempty"`
	TranslationTargets        []TranslationTarget `json:"translation_targets,omitempty"`
	Compatibility             string              `json:"compatibility,omitempty"`
	Status                    string              `json:"status,omitempty"`
}

// TranslationTarget represents a translation from one schema to another
type TranslationTarget struct {
	From string `json:"from"`
	To   string `json:"to"`
	Mode string `json:"mode"`
}

// TransportBinding represents a transport binding
type TransportBinding struct {
	Kind     string `json:"kind"` // "http"
	Endpoint string `json:"endpoint"`
}

// RegistryStatus represents the registry status
type RegistryStatus string

const (
	RegistryStatusActive     RegistryStatus = "active"
	RegistryStatusDeprecated RegistryStatus = "deprecated"
	RegistryStatusDisabled   RegistryStatus = "disabled"
)

// DescriptorSignatureAlg represents the signature algorithm
type DescriptorSignatureAlg string

const (
	DescriptorSignatureAlgHS256 DescriptorSignatureAlg = "HS256"
	DescriptorSignatureAlgRS256 DescriptorSignatureAlg = "RS256"
)

// AgentDescriptor describes an agent
type AgentDescriptor struct {
	AgentID                 string                 `json:"agent_id"`
	Organization            string                 `json:"organization"`
	Version                 string                 `json:"version"`
	Domain                  string                 `json:"domain"`
	Capabilities            []string               `json:"capabilities"`
	RiskLevel               RiskLevel              `json:"risk_level"`
	InputSchemaRef          string                 `json:"input_schema_ref"`
	OutputSchemaRef         string                 `json:"output_schema_ref"`
	SupportedExecutionModes []ExecutionMode        `json:"supported_execution_modes"`
	ApprovalRequirements    []string               `json:"approval_requirements,omitempty"`
	VisibilityModes         []VisibilityMode       `json:"visibility_modes"`
	PolicyHooks             []string               `json:"policy_hooks,omitempty"`
	DisplayName             string                 `json:"display_name,omitempty"`
	ProviderURL             string                 `json:"provider_url,omitempty"`
	DocumentationURL        string                 `json:"documentation_url,omitempty"`
	AuthSchemes             []AuthScheme           `json:"auth_schemes,omitempty"`
	CapabilityDescriptors   []CapabilityDescriptor `json:"capability_descriptors,omitempty"`
	TransportBindings       []TransportBinding     `json:"transport_bindings,omitempty"`
	Tags                    []string               `json:"tags,omitempty"`
	RegistryStatus          RegistryStatus         `json:"registry_status,omitempty"`
	Description             string                 `json:"description,omitempty"`
	DescriptorSignature     string                 `json:"descriptor_signature,omitempty"`
	DescriptorKeyID         string                 `json:"descriptor_key_id,omitempty"`
	DescriptorSignatureAlg  DescriptorSignatureAlg `json:"descriptor_signature_alg,omitempty"`
}

// ErrorCategory represents the category of an error
type ErrorCategory string

const (
	ErrorCategoryValidation     ErrorCategory = "validation"
	ErrorCategoryAuthentication ErrorCategory = "authentication"
	ErrorCategoryAuthorization  ErrorCategory = "authorization"
	ErrorCategoryNotFound       ErrorCategory = "not_found"
	ErrorCategoryConflict       ErrorCategory = "conflict"
	ErrorCategoryRateLimit      ErrorCategory = "rate_limit"
	ErrorCategoryServer         ErrorCategory = "server"
	ErrorCategoryClient         ErrorCategory = "client"
)

// ErrorDetails holds detailed error information
type ErrorDetails struct {
	Category ErrorCategory  `json:"category"`
	Field    string         `json:"field,omitempty"`
	Value    any            `json:"value,omitempty"`
	Context  map[string]any `json:"context,omitempty"`
}

// MapErrorResponse represents an error response from the MAP API
type MapErrorResponse struct {
	Code      ErrorCode     `json:"code"`
	Message   string        `json:"message"`
	Retryable bool          `json:"retryable"`
	Status    int           `json:"status"`
	Details   *ErrorDetails `json:"details,omitempty"`
	RequestID string        `json:"request_id,omitempty"`
}

// VersionInfo holds version information
type VersionInfo struct {
	Protocol  string `json:"protocol"`
	Schema    string `json:"schema"`
	Transport string `json:"transport"`
}

// HealthCheckStatus represents the status of a health check
type HealthCheckStatus string

const (
	HealthCheckStatusPass HealthCheckStatus = "pass"
	HealthCheckStatusFail HealthCheckStatus = "fail"
	HealthCheckStatusWarn HealthCheckStatus = "warn"
)

// HealthCheck holds a single health check result
type HealthCheck struct {
	Status    HealthCheckStatus `json:"status"`
	Message   string            `json:"message,omitempty"`
	Timestamp string            `json:"timestamp"`
}

// HealthStatus represents the overall health status
type HealthStatus struct {
	Status   string                 `json:"status"` // "healthy" | "degraded" | "unhealthy"
	Version  VersionInfo            `json:"version"`
	UptimeMs int64                  `json:"uptime_ms"`
	Checks   map[string]HealthCheck `json:"checks"`
}

// DelegationToken represents a delegation token
type DelegationToken struct {
	Issuer            string                 `json:"issuer"`
	SubjectAgent      string                 `json:"subject_agent"`
	AllowedActions    []string               `json:"allowed_actions"`
	ResourceScope     map[string]any         `json:"resource_scope"`
	Constraints       *DelegationConstraints `json:"constraints"`
	ApprovalReference string                 `json:"approval_reference,omitempty"`
	RequesterIdentity *RequesterIdentity     `json:"requester_identity,omitempty"`
	Signature         string                 `json:"signature"`
}

// DelegationConstraints holds constraints for delegation
type DelegationConstraints struct {
	Common    map[string]any `json:"common,omitempty"`
	Domain    map[string]any `json:"domain,omitempty"`
	ExpiresAt string         `json:"expires_at"`
}

// TaskEnvelope represents a task to be executed
type TaskEnvelope struct {
	TaskID              string            `json:"task_id"`
	ParentTaskID        string            `json:"parent_task_id,omitempty"`
	RequesterIdentity   RequesterIdentity `json:"requester_identity"`
	TargetAgent         string            `json:"target_agent"`
	Intent              string            `json:"intent"`
	Constraints         TaskConstraints   `json:"constraints"`
	RiskClass           RiskLevel         `json:"risk_class"`
	Deadline            string            `json:"deadline,omitempty"`
	DelegationToken     string            `json:"delegation_token"`
	RequestedOutputMode VisibilityMode    `json:"requested_output_mode"`
	Metadata            map[string]any    `json:"metadata,omitempty"`
}

// InvocationNegotiationRequest represents a negotiation request
type InvocationNegotiationRequest struct {
	SchemaVersion string       `json:"schema_version,omitempty"`
	DeliveryMode  DeliveryMode `json:"delivery_mode,omitempty"`
}

// InvocationNegotiation represents the negotiation result
type InvocationNegotiation struct {
	Requested       *NegotiationRequested `json:"requested"`
	Selected        *NegotiationSelected  `json:"selected"`
	ProviderActions []string              `json:"provider_actions,omitempty"`
}

// NegotiationRequested holds the client's requested parameters
type NegotiationRequested struct {
	SchemaVersion string         `json:"schema_version,omitempty"`
	OutputMode    VisibilityMode `json:"output_mode"`
	DeliveryMode  DeliveryMode   `json:"delivery_mode"`
}

// NegotiationSelected holds the server's selected parameters
type NegotiationSelected struct {
	SchemaVersion string         `json:"schema_version,omitempty"`
	OutputMode    VisibilityMode `json:"output_mode"`
	DeliveryMode  DeliveryMode   `json:"delivery_mode"`
}

// ResultPackage represents the result of a task execution
type ResultPackage struct {
	TaskID                  string                 `json:"task_id"`
	Status                  TaskStatus             `json:"status"`
	Summary                 string                 `json:"summary,omitempty"`
	StructuredOutput        map[string]any         `json:"structured_output"`
	ReceiptRef              string                 `json:"receipt_ref,omitempty"`
	NegotiatedSchemaVersion string                 `json:"negotiated_schema_version,omitempty"`
	RequestedSchemaVersion  string                 `json:"requested_schema_version,omitempty"`
	ExecutedSchemaVersion   string                 `json:"executed_schema_version,omitempty"`
	Negotiation             *InvocationNegotiation `json:"negotiation,omitempty"`
	RedactionsApplied       []string               `json:"redactions_applied,omitempty"`
	FollowupRequired        bool                   `json:"followup_required"`
	EscalationReason        string                 `json:"escalation_reason,omitempty"`
}

// ExecutionReceipt represents a receipt for task execution
type ExecutionReceipt struct {
	ReceiptID              string                 `json:"receipt_id"`
	TaskID                 string                 `json:"task_id"`
	TenantID               string                 `json:"tenant_id,omitempty"`
	RequestID              string                 `json:"request_id,omitempty"`
	AgentID                string                 `json:"agent_id"`
	ActionTaken            string                 `json:"action_taken"`
	ResourceTouched        string                 `json:"resource_touched"`
	PolicyChecks           []string               `json:"policy_checks"`
	ApprovalUsed           string                 `json:"approval_used,omitempty"`
	Timestamp              string                 `json:"timestamp"`
	ResultHash             string                 `json:"result_hash"`
	RequestedSchemaVersion string                 `json:"requested_schema_version,omitempty"`
	ExecutedSchemaVersion  string                 `json:"executed_schema_version,omitempty"`
	Negotiation            *InvocationNegotiation `json:"negotiation,omitempty"`
	Signature              string                 `json:"signature"`
}

// PolicyDecision represents a policy decision
type PolicyDecision struct {
	Allowed           bool           `json:"allowed"`
	Action            string         `json:"action"` // "allow" | "deny" | "require_approval"
	PolicyChecks      []string       `json:"policy_checks"`
	Reason            string         `json:"reason,omitempty"`
	ApprovalReference string         `json:"approval_reference,omitempty"`
	ScopedConstraints map[string]any `json:"scoped_constraints,omitempty"`
}

// InvokeResult represents the result of an invocation
type InvokeResult struct {
	Result  ResultPackage     `json:"result"`
	Receipt *ExecutionReceipt `json:"receipt,omitempty"`
}

// TaskRecord represents a task record
type TaskRecord struct {
	TaskID            string            `json:"task_id"`
	RequesterIdentity RequesterIdentity `json:"requester_identity"`
	IdempotencyKey    string            `json:"idempotency_key,omitempty"`
	Capability        string            `json:"capability"`
	TargetAgent       string            `json:"target_agent"`
	Status            TaskStatus        `json:"status"`
	Result            *ResultPackage    `json:"result,omitempty"`
	Receipt           *ExecutionReceipt `json:"receipt,omitempty"`
	UpdatedAt         string            `json:"updated_at"`
}

// DispatchRequest represents a dispatch request
type DispatchRequest struct {
	Capability             string                        `json:"capability"`
	Envelope               TaskEnvelope                  `json:"envelope"`
	RequestedSchemaVersion string                        `json:"requested_schema_version,omitempty"`
	Negotiation            *InvocationNegotiationRequest `json:"negotiation,omitempty"`
}

// ApprovalRequest represents an approval request
type ApprovalRequest struct {
	TaskID                 string                        `json:"task_id"`
	ApprovalReference      string                        `json:"approval_reference"`
	Capability             string                        `json:"capability"`
	Envelope               TaskEnvelope                  `json:"envelope"`
	RequestedSchemaVersion string                        `json:"requested_schema_version,omitempty"`
	Negotiation            *InvocationNegotiationRequest `json:"negotiation,omitempty"`
}

// MapSignedRequestHeaders represents the headers for signed requests
type MapSignedRequestHeaders struct {
	XMapAuthScheme       string `json:"x-map-auth-scheme"`
	XMapKeyID            string `json:"x-map-key-id"`
	XMapTimestamp        string `json:"x-map-timestamp"`
	XMapRequestSignature string `json:"x-map-request-signature"`
	XMapNonce            string `json:"x-map-nonce"`
}

// MapResponse represents a generic MAP response
type MapResponse[T any] struct {
	OK        ResultMode        `json:"ok"`
	RequestID string            `json:"request_id,omitempty"`
	Data      *T                `json:"data,omitempty"`
	Error     *MapErrorResponse `json:"error,omitempty"`
}

// DispatchResponse represents a dispatch response
type DispatchResponse struct {
	Result  ResultPackage     `json:"result"`
	Receipt *ExecutionReceipt `json:"receipt,omitempty"`
}

// ApprovalResponse represents an approval response
type ApprovalResponse struct {
	Result  ResultPackage     `json:"result"`
	Receipt *ExecutionReceipt `json:"receipt,omitempty"`
}

// PaginatedRequest represents a paginated request
type PaginatedRequest struct {
	Limit  int    `json:"limit,omitempty"`
	Cursor string `json:"cursor,omitempty"`
}

// Pagination holds pagination information
type Pagination struct {
	Limit      int    `json:"limit"`
	NextCursor string `json:"next_cursor"`
	Total      int    `json:"total,omitempty"`
}

// PaginatedResult holds a paginated result
type PaginatedResult[T any] struct {
	Items      []T        `json:"items"`
	Pagination Pagination `json:"pagination"`
}

// PaginatedTasks is a paginated list of tasks
type PaginatedTasks = PaginatedResult[TaskRecord]

// PaginatedAgents is a paginated list of agents
type PaginatedAgents = PaginatedResult[AgentDescriptor]

// TaskQueryParams represents query parameters for listing tasks
type TaskQueryParams struct {
	TenantID    string     `json:"tenant_id,omitempty"`
	Status      TaskStatus `json:"status,omitempty"`
	Capability  string     `json:"capability,omitempty"`
	TargetAgent string     `json:"target_agent,omitempty"`
	Limit       int        `json:"limit,omitempty"`
	Cursor      string     `json:"cursor,omitempty"`
}

// AgentsQueryParams represents query parameters for listing agents
type AgentsQueryParams struct {
	Domain       string `json:"domain,omitempty"`
	Capability   string `json:"capability,omitempty"`
	Organization string `json:"organization,omitempty"`
	Limit        int    `json:"limit,omitempty"`
	Cursor       string `json:"cursor,omitempty"`
}

// ErrorContext holds context for validation errors
type ErrorContext struct {
	Field         string `json:"field,omitempty"`
	Value         any    `json:"value,omitempty"`
	SchemaPath    string `json:"schema_path,omitempty"`
	OriginalError string `json:"original_error,omitempty"`
}

// ValidationErrorDetail represents a single validation error
type ValidationErrorDetail struct {
	Field   string        `json:"field"`
	Message string        `json:"message"`
	Code    ErrorCode     `json:"code"`
	Context *ErrorContext `json:"context,omitempty"`
}

// SchemaValidationError represents a schema validation error
type SchemaValidationError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details struct {
		Category         ErrorCategory           `json:"category"`
		ValidationErrors []ValidationErrorDetail `json:"validation_errors"`
		SchemaRef        string                  `json:"schema_ref"`
	} `json:"details"`
}

// VersionNegotiation represents version negotiation information
type VersionNegotiation struct {
	ClientVersion       string   `json:"clientVersion"`
	ServerVersion       string   `json:"serverVersion"`
	SelectedVersion     string   `json:"selectedVersion"`
	Compatible          bool     `json:"compatible"`
	NegotiationStrategy string   `json:"negotiationStrategy"`
	SupportedVersions   []string `json:"supportedVersions"`
}

// GetTaskOptions represents options for GetTask
type GetTaskOptions struct {
	TenantID string `json:"tenant_id,omitempty"`
}

// ListTasksOptions represents options for ListTasks
type ListTasksOptions struct {
	TenantID    string     `json:"tenant_id,omitempty"`
	Status      TaskStatus `json:"status,omitempty"`
	Capability  string     `json:"capability,omitempty"`
	TargetAgent string     `json:"target_agent,omitempty"`
	Limit       int        `json:"limit,omitempty"`
	Cursor      string     `json:"cursor,omitempty"`
}

// ListAgentsOptions represents options for ListAgents
type ListAgentsOptions struct {
	Domain       string `json:"domain,omitempty"`
	Capability   string `json:"capability,omitempty"`
	Organization string `json:"organization,omitempty"`
	Limit        int    `json:"limit,omitempty"`
	Cursor       string `json:"cursor,omitempty"`
}

// NewPagination creates a Pagination with default values
func NewPagination() *Pagination {
	return &Pagination{
		Limit: 20,
	}
}
