# MAP Authentication Model

## Overview

MAP separates two different trust layers:

- protocol-level delegation and receipt signing between MAP components
- transport-level client and provider authentication between an external assistant platform and a provider-owned MAP endpoint

This document defines the current authentication guidance for MAP transport bindings.

## Goals

MAP transport authentication should ensure that:

- the provider can identify the caller
- the caller can prove request integrity
- replayed requests can be rejected
- sensitive capabilities are not exposed as anonymous HTTP endpoints

## Authentication Schemes

MAP agent descriptors may advertise supported transport authentication through `auth_schemes`.

Current draft values:

- `none`
- `bearer`
- `mtls`
- `signed_request`

Providers may support more than one scheme during migration, but a deployment should define one primary scheme per transport binding.

Capability descriptors may further narrow this model with:

- `auth_schemes`
- `required_auth_scheme`

This lets a provider declare different auth expectations for different actions. For example, a low-risk read capability may allow `none` or `bearer`, while `payment.execute` requires `signed_request`.

## Signed Request

`signed_request` is the current recommended MAP transport scheme for HTTP-based provider integrations.

It is designed for assistant platforms and provider-owned MAP endpoints that already share a trust relationship and need request integrity without exposing long-lived execution credentials to the assistant runtime.

### Required Headers

For HTTP, a signed MAP request should include:

- `x-map-auth-scheme: signed_request`
- `x-map-key-id: <provider-recognized key id>`
- `x-map-timestamp: <RFC3339 timestamp>`
- `x-map-request-signature: <compact MAP signature>`

### Signing Input

The request signature should be computed over:

- HTTP method
- normalized request path
- request timestamp
- key id
- exact JSON request body bytes

This gives the provider tamper evidence over both payload and route.

### Replay Protection

Providers should reject requests whose timestamp falls outside an allowed freshness window.

The reference implementation uses a five-minute maximum age window by default.

### Verification Behavior

If a provider enforces signed requests:

- missing auth headers should return `401 auth_required`
- malformed or invalid signatures should return `403 invalid_auth`

## Bearer and mTLS

MAP should allow bearer authentication and mutual TLS where they are already standard inside an organization.

However, bearer-only designs are weaker than signed requests unless combined with request integrity controls, because they do not by themselves protect against body tampering or replay at the protocol layer.

Mutual TLS is strong for service-to-service deployments, but it is heavier operationally and less portable across all assistant-side environments.

## Relationship to Delegation Tokens

Transport authentication is not a substitute for delegation tokens.

The transport layer answers:

- who is calling the provider endpoint
- whether the wire request was tampered with

The delegation token answers:

- what this task is allowed to do
- which micro-agent may act
- what constraints apply

MAP needs both.

## Reference Implementation Notes

The current reference server:

- supports signed request verification for `POST /dispatch`
- supports signed request verification for `POST /approve`
- enforces signed requests automatically when a capability declares `required_auth_scheme = signed_request`
- can also enforce signed requests globally through server configuration
- verifies signed requests opportunistically when the caller explicitly uses the `signed_request` header set

This keeps local development simple while still demonstrating the intended provider-facing security model.
