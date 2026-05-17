// MAP Protocol - Micro Agent Protocol
//
// Copyright © 2026 Sidian Labs
// SPDX-License-Identifier: Apache-2.0

// SPDX-License-Identifier: Apache-2.0

package mapproto

import (
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"time"
)

// Transport defines the interface for HTTP transport
type Transport interface {
	RoundTrip(*http.Request) (*http.Response, error)
}

// HTTPTransport implements a robust HTTP transport with retry logic
type HTTPTransport struct {
	Client         *http.Client
	RetryEnabled   bool
	MaxRetries     int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	JitterFactor   float64
}

// HTTPTransportOption is a functional option for HTTPTransport
type HTTPTransportOption func(*HTTPTransport)

// WithRetryEnabled sets whether retry is enabled
func WithRetryEnabled(enabled bool) HTTPTransportOption {
	return func(t *HTTPTransport) {
		t.RetryEnabled = enabled
	}
}

// WithMaxRetries sets the maximum number of retries
func WithMaxRetries(max int) HTTPTransportOption {
	return func(t *HTTPTransport) {
		t.MaxRetries = max
	}
}

// WithInitialBackoff sets the initial backoff duration
func WithInitialBackoff(d time.Duration) HTTPTransportOption {
	return func(t *HTTPTransport) {
		t.InitialBackoff = d
	}
}

// WithMaxBackoff sets the maximum backoff duration
func WithMaxBackoff(d time.Duration) HTTPTransportOption {
	return func(t *HTTPTransport) {
		t.MaxBackoff = d
	}
}

// NewHTTPTransport creates a new HTTPTransport with options
func NewHTTPTransport(client *http.Client, opts ...HTTPTransportOption) *HTTPTransport {
	if client == nil {
		client = &http.Client{
			Timeout: 30 * time.Second,
		}
	}

	t := &HTTPTransport{
		Client:         client,
		RetryEnabled:   true,
		MaxRetries:     3,
		InitialBackoff: 100 * time.Millisecond,
		MaxBackoff:     30 * time.Second,
		JitterFactor:   0.1,
	}

	for _, opt := range opts {
		opt(t)
	}

	return t
}

// RoundTrip implements the Transport interface with retry logic
func (t *HTTPTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if !t.RetryEnabled {
		return t.Client.Do(req)
	}

	return t.doWithRetry(req)
}

func (t *HTTPTransport) doWithRetry(req *http.Request) (*http.Response, error) {
	var resp *http.Response
	var err error

	for attempt := 0; attempt <= t.MaxRetries; attempt++ {
		if attempt > 0 {
			// Check if context is cancelled
			if req.Context().Err() != nil {
				return nil, req.Context().Err()
			}

			// Calculate backoff with jitter
			backoff := t.calculateBackoff(attempt)
			time.Sleep(backoff)
		}

		// Clone the request for each attempt
		reqClone := cloneRequest(req)

		resp, err = t.Client.Do(reqClone)
		if err != nil {
			// Don't retry client errors (except rate limit)
			if attempt >= t.MaxRetries {
				return nil, fmt.Errorf("request failed after %d attempts: %w", attempt, err)
			}
			continue
		}

		// Check if response indicates we should retry
		if !t.isRetryableResponse(resp) {
			return resp, nil
		}

		// Close the response body before retrying
		if resp.Body != nil {
			io.ReadAll(resp.Body)
			resp.Body.Close()
		}

		// Don't retry rate limit if we got a Retry-After header
		if resp.StatusCode == http.StatusTooManyRequests {
			if retryAfter := t.parseRetryAfter(resp); retryAfter > 0 {
				time.Sleep(retryAfter)
			}
		}
	}

	return resp, err
}

func (t *HTTPTransport) isRetryableResponse(resp *http.Response) bool {
	// Retry on 5xx errors and 429 rate limit
	if resp.StatusCode >= 500 {
		return true
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return true
	}
	if resp.StatusCode == http.StatusServiceUnavailable {
		return true
	}
	return false
}

func (t *HTTPTransport) calculateBackoff(attempt int) time.Duration {
	// Exponential backoff: initial * 2^attempt
	backoff := float64(t.InitialBackoff) * math.Pow(2, float64(attempt))

	// Cap at max backoff
	if backoff > float64(t.MaxBackoff) {
		backoff = float64(t.MaxBackoff)
	}

	// Add jitter
	jitter := backoff * t.JitterFactor * (2*rand.Float64() - 1)
	backoff += jitter

	return time.Duration(backoff)
}

func (t *HTTPTransport) parseRetryAfter(resp *http.Response) time.Duration {
	retryAfter := resp.Header.Get("Retry-After")
	if retryAfter == "" {
		return 0
	}

	// Try to parse as seconds
	var seconds int
	if _, err := fmt.Sscanf(retryAfter, "%d", &seconds); err == nil {
		return time.Duration(seconds) * time.Second
	}

	// Try to parse as HTTP date
	if parsedTime, err := time.Parse(http.TimeFormat, retryAfter); err == nil {
		return time.Until(parsedTime)
	}

	return 0
}

func cloneRequest(req *http.Request) *http.Request {
	// Create a shallow copy of the request
	newReq := *req

	// Deep copy headers
	newReq.Header = make(http.Header, len(req.Header))
	for k, v := range req.Header {
		newReq.Header[k] = make([]string, len(v))
		copy(newReq.Header[k], v)
	}

	// Deep copy URL
	newReq.URL = &url.URL{}
	*newReq.URL = *req.URL

	// Deep copy context if needed
	if req.Body != nil {
		// Read body content
		bodyBytes, err := io.ReadAll(req.Body)
		req.Body.Close()
		if err == nil {
			newReq.Body = io.NopCloser(
				&readCloser{
					data:   bodyBytes,
					offset: 0,
				},
			)
			newReq.GetBody = func() (io.ReadCloser, error) {
				return io.NopCloser(
					&readCloser{
						data:   bodyBytes,
						offset: 0,
					},
				), nil
			}
		}
	}

	return &newReq
}

type readCloser struct {
	data   []byte
	offset int
}

func (r *readCloser) Read(p []byte) (n int, err error) {
	if r.offset >= len(r.data) {
		return 0, io.EOF
	}
	n = copy(p, r.data[r.offset:])
	r.offset += n
	return n, nil
}

func (r *readCloser) Close() error {
	return nil
}

// RoundTripFunc is a function adapter for Transport
type RoundTripFunc func(*http.Request) (*http.Response, error)

// RoundTrip implements the Transport interface
func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
