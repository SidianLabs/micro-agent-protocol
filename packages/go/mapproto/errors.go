// MAP Protocol - Micro Agent Protocol
//
// Copyright © 2026 Sidian Labs
// SPDX-License-Identifier: Apache-2.0

// SPDX-License-Identifier: Apache-2.0

package mapproto

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// MapError represents a MAP error with code and message
type MapError struct {
	Code      ErrorCode
	Message   string
	Retryable bool
	Status    int
	Details   *ErrorDetails
}

func (e *MapError) Error() string {
	if e.Details != nil {
		return fmt.Sprintf("%s: %s (details: %+v)", e.Code, e.Message, e.Details)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap returns the underlying error
func (e *MapError) Unwrap() error {
	return nil
}

// MapAPIError represents an error returned by the MAP API
type MapAPIError struct {
	Code      ErrorCode     `json:"code"`
	Message   string        `json:"message"`
	Retryable bool          `json:"retryable"`
	Status    int           `json:"-"`
	Details   *ErrorDetails `json:"details,omitempty"`
	RequestID string        `json:"request_id,omitempty"`
}

func (e *MapAPIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// MapRetryableError represents a retryable error
type MapRetryableError struct {
	Message        string
	RetryAfterMs   int
	RetryAfterSecs float64
}

func (e *MapRetryableError) Error() string {
	return fmt.Sprintf("retryable error: %s (retry after %.1fs)", e.Message, e.RetryAfterSecs)
}

// ErrNotFound is returned when a resource is not found
var ErrNotFound = errors.New("resource not found")

// ErrTimeout is returned when a request times out
var ErrTimeout = errors.New("request timeout")

// ErrRateLimited is returned when rate limited
var ErrRateLimited = errors.New("rate limit exceeded")

// ErrUnauthorized is returned when unauthorized
var ErrUnauthorized = errors.New("unauthorized")

// ErrForbidden is returned when forbidden
var ErrForbidden = errors.New("forbidden")

// ErrInternal is returned for internal errors
var ErrInternal = errors.New("internal error")

// ErrSchemaValidationFailed is returned when schema validation fails
var ErrSchemaValidationFailed = errors.New("schema validation failed")

// ErrApprovalRequired is returned when approval is required
var ErrApprovalRequired = errors.New("approval required")

// ErrTaskNotFound is an alias for ErrNotFound for task operations
var ErrTaskNotFound = ErrNotFound

// ErrAgentNotFound is returned when an agent is not found
var ErrAgentNotFound = errors.New("agent not found")

// NewMapError creates a new MapError
func NewMapError(code ErrorCode, message string, retryable bool, status int) *MapError {
	return &MapError{
		Code:      code,
		Message:   message,
		Retryable: retryable,
		Status:    status,
	}
}

// NewMapAPIError creates a new MapAPIError from an error code and message
func NewMapAPIError(code ErrorCode, message string) *MapAPIError {
	retryable, ok := ErrorCodeRetryableMap[code]
	if !ok {
		retryable = false
	}
	status, ok := ErrorCodeStatusMap[code]
	if !ok {
		status = 500
	}
	return &MapAPIError{
		Code:      code,
		Message:   message,
		Retryable: retryable,
		Status:    status,
	}
}

// FromAPIError converts an API error response to a MapAPIError
func FromAPIError(apiErr *MapErrorResponse) *MapAPIError {
	if apiErr == nil {
		return nil
	}
	return &MapAPIError{
		Code:      apiErr.Code,
		Message:   apiErr.Message,
		Retryable: apiErr.Retryable,
		Status:    apiErr.Status,
		Details:   apiErr.Details,
		RequestID: apiErr.RequestID,
	}
}

// ToMapError converts a MapAPIError to a MapError
func (e *MapAPIError) ToMapError() *MapError {
	if e == nil {
		return nil
	}
	return &MapError{
		Code:      e.Code,
		Message:   e.Message,
		Retryable: e.Retryable,
		Status:    e.Status,
		Details:   e.Details,
	}
}

// IsRetryable returns true if the error is retryable
func (e *MapAPIError) IsRetryable() bool {
	return e.Retryable
}

// ParseHTTPError parses an HTTP error response into a MapAPIError
func ParseHTTPError(resp *http.Response) *MapAPIError {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return &MapAPIError{
			Code:      ErrorCodeInternalError,
			Message:   fmt.Sprintf("failed to read response body: %v", err),
			Retryable: false,
			Status:    resp.StatusCode,
		}
	}

	// Try to parse as MapErrorResponse
	var errResp MapErrorResponse
	if err := decodeJSON(body, &errResp); err == nil && errResp.Code != "" {
		errResp.Status = resp.StatusCode
		return FromAPIError(&errResp)
	}

	// Fallback: try to parse as MapAPIError
	var apiErr MapAPIError
	if err := decodeJSON(body, &apiErr); err == nil && apiErr.Code != "" {
		apiErr.Status = resp.StatusCode
		return &apiErr
	}

	// Fallback: create error from status code
	code := errorCodeFromStatus(resp.StatusCode)
	message := strings.TrimSpace(string(body))
	if message == "" {
		message = http.StatusText(resp.StatusCode)
	}

	retryable, _ := ErrorCodeRetryableMap[code]

	return &MapAPIError{
		Code:      code,
		Message:   message,
		Retryable: retryable,
		Status:    resp.StatusCode,
	}
}

func errorCodeFromStatus(status int) ErrorCode {
	switch status {
	case http.StatusNotFound:
		return ErrorCodeResourceNotFound
	case http.StatusUnauthorized:
		return ErrorCodeUnauthorized
	case http.StatusForbidden:
		return ErrorCodeForbidden
	case http.StatusBadRequest:
		return ErrorCodeInvalidRequest
	case http.StatusConflict:
		return ErrorCodeIdempotencyConflict
	case http.StatusTooManyRequests:
		return ErrorCodeRateLimitExceeded
	case http.StatusRequestTimeout:
		return ErrorCodeRequestTimeout
	default:
		if status >= 500 {
			return ErrorCodeInternalError
		}
		return ErrorCodeInvalidRequest
	}
}

// ValidationError represents a single validation error
type ValidationError struct {
	Field   string    `json:"field"`
	Message string    `json:"message"`
	Code    ErrorCode `json:"code"`
}

// MapValidationError represents validation errors
type MapValidationError struct {
	Errors []ValidationError
}

func (e *MapValidationError) Error() string {
	if len(e.Errors) == 0 {
		return "validation failed"
	}
	var b strings.Builder
	b.WriteString("validation failed: ")
	for i, err := range e.Errors {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(err.Field)
		b.WriteString(": ")
		b.WriteString(err.Message)
	}
	return b.String()
}

// NewValidationError creates a new validation error
func NewValidationError(field, message string, code ErrorCode) *ValidationError {
	return &ValidationError{
		Field:   field,
		Message: message,
		Code:    code,
	}
}

// AddValidationError adds a validation error to the list
func (e *MapValidationError) AddValidationError(field, message string, code ErrorCode) {
	e.Errors = append(e.Errors, ValidationError{
		Field:   field,
		Message: message,
		Code:    code,
	})
}

// GetStatus returns the HTTP status code for this error
func (e *MapError) GetStatus() int {
	return e.Status
}

// GetRetryable returns whether this error is retryable
func (e *MapError) GetRetryable() bool {
	return e.Retryable
}

// decodeJSON is a helper to decode JSON with better error messages
func decodeJSON(data []byte, v any) error {
	return json.Unmarshal(data, v)
}
