// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package mapproto

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// ClientOptions configures the MAP client
type ClientOptions struct {
	BaseURL    string
	Timeout    time.Duration
	Signer     Signer
	Transport  Transport
	HeaderFunc func(*http.Request)
}

// Client is the MAP protocol client
type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
	signer     Signer
	transport  Transport
	headerFunc func(*http.Request)
}

// ClientOption is a functional option for configuring the client
type ClientOption func(*ClientOptions)

// NewClient creates a new MAP client with options
func NewClient(opts ...ClientOption) (*Client, error) {
	options := &ClientOptions{
		BaseURL:   "http://localhost:8787",
		Timeout:   30 * time.Second,
		Transport: NewHTTPTransport(nil),
	}

	for _, opt := range opts {
		opt(options)
	}

	baseURL, err := url.Parse(options.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid base URL: %w", err)
	}

	if options.Transport == nil {
		options.Transport = NewHTTPTransport(nil)
	}

	httpClient := &http.Client{
		Timeout:   options.Timeout,
		Transport: options.Transport,
	}

	return &Client{
		baseURL:    baseURL,
		httpClient: httpClient,
		signer:     options.Signer,
		transport:  options.Transport,
		headerFunc: options.HeaderFunc,
	}, nil
}

// WithBaseURL sets the base URL for the client
func WithBaseURL(baseURL string) ClientOption {
	return func(opts *ClientOptions) {
		opts.BaseURL = baseURL
	}
}

// WithSigner sets the signer for the client
func WithSigner(signer Signer) ClientOption {
	return func(opts *ClientOptions) {
		opts.Signer = signer
	}
}

// WithTimeout sets the timeout for the client
func WithTimeout(timeout time.Duration) ClientOption {
	return func(opts *ClientOptions) {
		opts.Timeout = timeout
	}
}

// WithTransport sets the transport for the client
func WithTransport(transport Transport) ClientOption {
	return func(opts *ClientOptions) {
		opts.Transport = transport
	}
}

// WithHeaderFunc sets a custom header function
func WithHeaderFunc(f func(*http.Request)) ClientOption {
	return func(opts *ClientOptions) {
		opts.HeaderFunc = f
	}
}

func (c *Client) newRequest(ctx context.Context, method, path string, body interface{}) (*http.Request, error) {
	u := c.baseURL.JoinPath(path)

	var buf io.Reader
	var bodyBytes []byte

	if body != nil {
		var err error
		bodyBytes, err = json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		buf = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), buf)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "mapproto-go/"+Version)

	if c.signer != nil {
		timestamp := GenerateTimestamp()
		bodyStr := ""
		if bodyBytes != nil {
			bodyStr = string(bodyBytes)
		}
		signature, err := c.signer.Sign(method, path, bodyStr, timestamp)
		if err == nil {
			req.Header.Set("X-Map-Auth-Scheme", "signed_request")
			req.Header.Set("X-Map-Key-Id", c.signer.GetKeyID())
			req.Header.Set("X-Map-Timestamp", timestamp)
			req.Header.Set("X-Map-Request-Signature", signature)
			req.Header.Set("X-Map-Nonce", GenerateNonce())
		}
	}

	if c.headerFunc != nil {
		c.headerFunc(req)
	}

	return req, nil
}

func (c *Client) doRequest(ctx context.Context, req *http.Request) (*http.Response, error) {
	return c.httpClient.Do(req)
}

func (c *Client) parseResponse(resp *http.Response, result interface{}) error {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		apiErr := ParseHTTPError(resp)
		if apiErr != nil {
			return apiErr
		}
		return fmt.Errorf("request failed with status: %d body: %s", resp.StatusCode, string(body))
	}

	if len(body) == 0 {
		return nil
	}

	if err := json.Unmarshal(body, result); err != nil {
		return fmt.Errorf("failed to decode response: %w body: %s", err, string(body))
	}

	return nil
}

// Dispatch submits a task for execution
func (c *Client) Dispatch(ctx context.Context, req *DispatchRequest) (*InvokeResult, error) {
	httpReq, err := c.newRequest(ctx, http.MethodPost, "/dispatch", req)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("dispatch request failed: %w", err)
	}
	defer resp.Body.Close()

	var invokeResult InvokeResult
	if err := c.parseResponse(resp, &invokeResult); err != nil {
		return nil, err
	}

	return &invokeResult, nil
}

// Approve approves a task that requires approval
func (c *Client) Approve(ctx context.Context, req *ApprovalRequest) (*InvokeResult, error) {
	httpReq, err := c.newRequest(ctx, http.MethodPost, "/approve", req)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("approval request failed: %w", err)
	}
	defer resp.Body.Close()

	var invokeResult InvokeResult
	if err := c.parseResponse(resp, &invokeResult); err != nil {
		return nil, err
	}

	return &invokeResult, nil
}

// GetTask retrieves a task by ID
func (c *Client) GetTask(ctx context.Context, taskID string, opts *GetTaskOptions) (*TaskRecord, error) {
	path := "/tasks/" + taskID

	if opts != nil && opts.TenantID != "" {
		path = path + "?tenant_id=" + url.QueryEscape(opts.TenantID)
	}

	httpReq, err := c.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("get task request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrTaskNotFound
	}

	var taskRecord TaskRecord
	if err := c.parseResponse(resp, &taskRecord); err != nil {
		return nil, err
	}

	return &taskRecord, nil
}

// ListTasks lists tasks with optional filters
func (c *Client) ListTasks(ctx context.Context, opts *ListTasksOptions) (*PaginatedTasks, error) {
	u := c.baseURL.JoinPath("/tasks")
	q := u.Query()

	if opts != nil {
		if opts.TenantID != "" {
			q.Set("tenant_id", opts.TenantID)
		}
		if opts.Status != "" {
			q.Set("status", string(opts.Status))
		}
		if opts.Capability != "" {
			q.Set("capability", opts.Capability)
		}
		if opts.TargetAgent != "" {
			q.Set("target_agent", opts.TargetAgent)
		}
		if opts.Limit > 0 {
			q.Set("limit", strconv.Itoa(opts.Limit))
		}
		if opts.Cursor != "" {
			q.Set("cursor", opts.Cursor)
		}
	}

	u.RawQuery = q.Encode()

	httpReq, err := c.newRequest(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("list tasks request failed: %w", err)
	}
	defer resp.Body.Close()

	var paginatedTasks PaginatedTasks
	if err := c.parseResponse(resp, &paginatedTasks); err != nil {
		return nil, err
	}

	return &paginatedTasks, nil
}

// ListAgents lists agents with optional filters
func (c *Client) ListAgents(ctx context.Context, opts *ListAgentsOptions) (*PaginatedAgents, error) {
	u := c.baseURL.JoinPath("/agents")
	q := u.Query()

	if opts != nil {
		if opts.Domain != "" {
			q.Set("domain", opts.Domain)
		}
		if opts.Capability != "" {
			q.Set("capability", opts.Capability)
		}
		if opts.Organization != "" {
			q.Set("organization", opts.Organization)
		}
		if opts.Limit > 0 {
			q.Set("limit", strconv.Itoa(opts.Limit))
		}
		if opts.Cursor != "" {
			q.Set("cursor", opts.Cursor)
		}
	}

	u.RawQuery = q.Encode()

	httpReq, err := c.newRequest(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("list agents request failed: %w", err)
	}
	defer resp.Body.Close()

	var paginatedAgents PaginatedAgents
	if err := c.parseResponse(resp, &paginatedAgents); err != nil {
		return nil, err
	}

	return &paginatedAgents, nil
}

// GetHealth retrieves the health status
func (c *Client) GetHealth(ctx context.Context) (*HealthStatus, error) {
	httpReq, err := c.newRequest(ctx, http.MethodGet, "/health", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("health check request failed: %w", err)
	}
	defer resp.Body.Close()

	var healthStatus HealthStatus
	if err := c.parseResponse(resp, &healthStatus); err != nil {
		return nil, err
	}

	return &healthStatus, nil
}

// GetReceipt retrieves an execution receipt by ID
func (c *Client) GetReceipt(ctx context.Context, receiptID string) (*ExecutionReceipt, error) {
	httpReq, err := c.newRequest(ctx, http.MethodGet, "/receipts/"+receiptID, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("get receipt request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}

	var executionReceipt ExecutionReceipt
	if err := c.parseResponse(resp, &executionReceipt); err != nil {
		return nil, err
	}

	return &executionReceipt, nil
}

// GetAgent retrieves an agent by ID
func (c *Client) GetAgent(ctx context.Context, agentID string) (*AgentDescriptor, error) {
	httpReq, err := c.newRequest(ctx, http.MethodGet, "/agents/"+agentID, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("get agent request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrAgentNotFound
	}

	var agent AgentDescriptor
	if err := c.parseResponse(resp, &agent); err != nil {
		return nil, err
	}

	return &agent, nil
}

// urlJoin joins URL query parameters
func urlJoin(items []string) string {
	if len(items) == 0 {
		return ""
	}
	result := items[0]
	for i := 1; i < len(items); i++ {
		result += "," + items[i]
	}
	return result
}
