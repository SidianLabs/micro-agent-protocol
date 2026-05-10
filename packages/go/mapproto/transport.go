// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package mapproto

import (
	"net/http"
)

type Transport interface {
	RoundTrip(*http.Request) (*http.Response, error)
}

type HTTPTransport struct {
	Client *http.Client
}

func NewHTTPTransport(client *http.Client) *HTTPTransport {
	if client == nil {
		client = http.DefaultClient
	}
	return &HTTPTransport{
		Client: client,
	}
}

func (t *HTTPTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return t.Client.Do(req)
}

type RoundTripFunc func(*http.Request) (*http.Response, error)

func (f RoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
