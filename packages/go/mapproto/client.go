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

type ClientOptions struct {
	BaseURL    string
	Timeout    time.Duration
	Signer     Signer
	Transport  Transport
	HeaderFunc func(*http.Request)
}

type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
	signer     Signer
	transport  Transport
	headerFunc func(*http.Request)
}

type ClientOption func(*ClientOptions)

func NewClient(opts ...ClientOption) (*Client, error) {
	options := &ClientOptions{
		BaseURL:   "https://api.mapprotocol.io",
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

func WithBaseURL(baseURL string) ClientOption {
	return func(opts *ClientOptions) {
		opts.BaseURL = baseURL
	}
}

func WithSigner(signer Signer) ClientOption {
	return func(opts *ClientOptions) {
		opts.Signer = signer
	}
}

func WithTimeout(timeout time.Duration) ClientOption {
	return func(opts *ClientOptions) {
		opts.Timeout = timeout
	}
}

func WithTransport(transport Transport) ClientOption {
	return func(opts *ClientOptions) {
		opts.Transport = transport
	}
}

func WithHeaderFunc(f func(*http.Request)) ClientOption {
	return func(opts *ClientOptions) {
		opts.HeaderFunc = f
	}
}

func (c *Client) newRequest(ctx context.Context, method, path string, body interface{}) (*http.Request, error) {
	u := c.baseURL.JoinPath(path)

	var buf io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		buf = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), buf)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "mapproto-go/"+Version)

	if c.signer != nil && body != nil {
		req.Header.Set("X-Key-ID", c.signer.KeyID())
		var bodyBytes []byte
		if buf != nil {
			bodyBytes, _ = io.ReadAll(req.Body)
			req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		}
		signature, err := c.signer.SignRequest(bodyBytes)
		if err == nil {
			req.Header.Set("X-Signature", signature)
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

func (c *Client) Dispatch(ctx context.Context, req DispatchRequest) (*TaskRecord, error) {
	httpReq, err := c.newRequest(ctx, http.MethodPost, "/v1/tasks/dispatch", req)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("dispatch request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		apiErr := APIError{}
		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err == nil {
			return nil, FromAPIError(apiErr)
		}
		return nil, fmt.Errorf("dispatch failed with status: %d", resp.StatusCode)
	}

	var task TaskRecord
	if err := json.NewDecoder(resp.Body).Decode(&task); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &task, nil
}

func (c *Client) Approve(ctx context.Context, requestID string, approved bool) error {
	body := map[string]interface{}{
		"requestId": requestID,
		"approved":  approved,
	}

	httpReq, err := c.newRequest(ctx, http.MethodPost, "/v1/tasks/approve", body)
	if err != nil {
		return err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return fmt.Errorf("approval request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		apiErr := APIError{}
		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err == nil {
			return FromAPIError(apiErr)
		}
		return fmt.Errorf("approval failed with status: %d", resp.StatusCode)
	}

	return nil
}

func (c *Client) GetTask(ctx context.Context, taskID string) (*TaskRecord, error) {
	httpReq, err := c.newRequest(ctx, http.MethodGet, "/v1/tasks/"+taskID, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("get task request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}

	if resp.StatusCode != http.StatusOK {
		apiErr := APIError{}
		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err == nil {
			return nil, FromAPIError(apiErr)
		}
		return nil, fmt.Errorf("get task failed with status: %d", resp.StatusCode)
	}

	var task TaskRecord
	if err := json.NewDecoder(resp.Body).Decode(&task); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &task, nil
}

type ListTasksResponse struct {
	Tasks      []TaskRecord `json:"tasks"`
	Page       int          `json:"page"`
	PageSize   int          `json:"pageSize"`
	TotalCount int          `json:"totalCount"`
}

func (c *Client) ListTasks(ctx context.Context, status TaskStatus, page, pageSize int) (*ListTasksResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	q := c.baseURL.Query()
	q.Set("status", string(status))
	q.Set("page", strconv.Itoa(page))
	q.Set("pageSize", strconv.Itoa(pageSize))

	u := c.baseURL.JoinPath("/v1/tasks")
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

	if resp.StatusCode != http.StatusOK {
		apiErr := APIError{}
		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err == nil {
			return nil, FromAPIError(apiErr)
		}
		return nil, fmt.Errorf("list tasks failed with status: %d", resp.StatusCode)
	}

	var result ListTasksResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

func (c *Client) ListAgents(ctx context.Context, tags []string, page, pageSize int) ([]AgentDescriptor, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	u := c.baseURL.JoinPath("/v1/agents")
	q := u.Query()
	if len(tags) > 0 {
		q.Set("tags", urlJoin(tags))
	}
	q.Set("page", strconv.Itoa(page))
	q.Set("pageSize", strconv.Itoa(pageSize))
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

	if resp.StatusCode != http.StatusOK {
		apiErr := APIError{}
		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err == nil {
			return nil, FromAPIError(apiErr)
		}
		return nil, fmt.Errorf("list agents failed with status: %d", resp.StatusCode)
	}

	var agents []AgentDescriptor
	if err := json.NewDecoder(resp.Body).Decode(&agents); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return agents, nil
}

type HealthResponse struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Timestamp int64  `json:"timestamp"`
}

func (c *Client) GetHealth(ctx context.Context) (*HealthResponse, error) {
	httpReq, err := c.newRequest(ctx, http.MethodGet, "/v1/health", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.doRequest(ctx, httpReq)
	if err != nil {
		return nil, fmt.Errorf("health check request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("health check failed with status: %d", resp.StatusCode)
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &health, nil
}

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
