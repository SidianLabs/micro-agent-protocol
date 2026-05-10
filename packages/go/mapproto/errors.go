// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package mapproto

import (
	"errors"
	"fmt"
)

type ErrorCode string

const (
	ErrCodeAgentNotFound             ErrorCode = "agent_not_found"
	ErrCodeAgentDisabled             ErrorCode = "agent_disabled"
	ErrCodeCapabilityNotFound        ErrorCode = "capability_not_found"
	ErrCodeCapabilityDisabled        ErrorCode = "capability_disabled"
	ErrCodePolicyDenied              ErrorCode = "policy_denied"
	ErrCodeApprovalRequired          ErrorCode = "approval_required"
	ErrCodeApprovalDenied            ErrorCode = "approval_denied"
	ErrCodeApprovalExpired           ErrorCode = "approval_expired"
	ErrCodeInvalidDelegationToken    ErrorCode = "invalid_delegation_token"
	ErrCodeTokenExpired              ErrorCode = "token_expired"
	ErrCodeTokenInvalidSignature     ErrorCode = "token_invalid_signature"
	ErrCodeTokenMissingScope         ErrorCode = "token_missing_scope"
	ErrCodeSchemaValidationFailed    ErrorCode = "schema_validation_failed"
	ErrCodeSchemaVersionUnsupported  ErrorCode = "schema_version_unsupported"
	ErrCodeSchemaNegotiationFailed   ErrorCode = "schema_negotiation_failed"
	ErrCodeTenantMismatch            ErrorCode = "tenant_mismatch"
	ErrCodeRateLimitExceeded         ErrorCode = "rate_limit_exceeded"
	ErrCodeRequestTimeout            ErrorCode = "request_timeout"
	ErrCodeInternalError             ErrorCode = "internal_error"
	ErrCodeInvalidRequest            ErrorCode = "invalid_request"
	ErrCodeIdempotencyConflict       ErrorCode = "idempotency_conflict"
	ErrCodeResourceNotFound          ErrorCode = "resource_not_found"
	ErrCodeUnauthorized              ErrorCode = "unauthorized"
	ErrCodeForbidden                 ErrorCode = "forbidden"
)

var ErrorCodeStatusMap = map[ErrorCode]int{
	ErrCodeAgentNotFound:            404,
	ErrCodeAgentDisabled:            403,
	ErrCodeCapabilityNotFound:       404,
	ErrCodeCapabilityDisabled:       403,
	ErrCodePolicyDenied:             403,
	ErrCodeApprovalRequired:         202,
	ErrCodeApprovalDenied:          403,
	ErrCodeApprovalExpired:          410,
	ErrCodeInvalidDelegationToken:   401,
	ErrCodeTokenExpired:             401,
	ErrCodeTokenInvalidSignature:    401,
	ErrCodeTokenMissingScope:        403,
	ErrCodeSchemaValidationFailed:   400,
	ErrCodeSchemaVersionUnsupported: 400,
	ErrCodeSchemaNegotiationFailed:  400,
	ErrCodeTenantMismatch:           400,
	ErrCodeRateLimitExceeded:        429,
	ErrCodeRequestTimeout:           408,
	ErrCodeInternalError:            500,
	ErrCodeInvalidRequest:           400,
	ErrCodeIdempotencyConflict:      409,
	ErrCodeResourceNotFound:         404,
	ErrCodeUnauthorized:             401,
	ErrCodeForbidden:                403,
}

var ErrorCodeRetryableMap = map[ErrorCode]bool{
	ErrCodeAgentNotFound:            false,
	ErrCodeAgentDisabled:            false,
	ErrCodeCapabilityNotFound:       false,
	ErrCodeCapabilityDisabled:       false,
	ErrCodePolicyDenied:             false,
	ErrCodeApprovalRequired:         false,
	ErrCodeApprovalDenied:           false,
	ErrCodeApprovalExpired:          false,
	ErrCodeInvalidDelegationToken:   false,
	ErrCodeTokenExpired:             false,
	ErrCodeTokenInvalidSignature:    false,
	ErrCodeTokenMissingScope:        false,
	ErrCodeSchemaValidationFailed:   false,
	ErrCodeSchemaVersionUnsupported: false,
	ErrCodeSchemaNegotiationFailed:  false,
	ErrCodeTenantMismatch:          false,
	ErrCodeRateLimitExceeded:        true,
	ErrCodeRequestTimeout:           true,
	ErrCodeInternalError:            true,
	ErrCodeInvalidRequest:          false,
	ErrCodeIdempotencyConflict:      false,
	ErrCodeResourceNotFound:        false,
	ErrCodeUnauthorized:             true,
	ErrCodeForbidden:               false,
}

type APIError struct {
	Code      ErrorCode   `json:"code"`
	Message   string      `json:"message"`
	Retryable bool        `json:"retryable"`
	Status    int         `json:"-"`
	Details   interface{} `json:"details,omitempty"`
}

func (e APIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func NewAPIError(code ErrorCode, message string, details interface{}) APIError {
	retryable, ok := ErrorCodeRetryableMap[code]
	if !ok {
		retryable = false
	}
	status, ok := ErrorCodeStatusMap[code]
	if !ok {
		status = 500
	}
	return APIError{
		Code:      code,
		Message:   message,
		Retryable: retryable,
		Status:    status,
		Details:   details,
	}
}

type MapError struct {
	Code    ErrorCode
	Message string
	Err     error
}

func (e *MapError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *MapError) Unwrap() error {
	return e.Err
}

func (e *MapError) Is(target error) bool {
	return e.Err == target
}

func NewMapError(code ErrorCode, message string, err error) *MapError {
	return &MapError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

func FromAPIError(apiErr APIError) *MapError {
	return &MapError{
		Code:    apiErr.Code,
		Message: apiErr.Message,
	}
}

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
	Code    ErrorCode `json:"code"`
}

type MapValidationError struct {
	Errors []ValidationError
}

func (e *MapValidationError) Error() string {
	if len(e.Errors) == 0 {
		return "validation failed"
	}
	return fmt.Sprintf("validation failed: %v", e.Errors)
}

type MapRetryableError struct {
	Message     string
	RetryAfterMs int
}

func (e *MapRetryableError) Error() string {
	return fmt.Sprintf("retryable error: %s (retry after %dms)", e.Message, e.RetryAfterMs)
}

var ErrNotFound = errors.New("resource not found")

var ErrTimeout = errors.New("request timeout")

var ErrCodeInternal = errors.New("internal error")
