# MAP Key Management Draft

## Overview

MAP needs a standard way for clients to learn which provider keys are currently valid for verifying discovery metadata and other signed protocol artifacts.

This document defines the current draft key-discovery and rotation model.

## Goals

MAP key management should make it possible to:

- discover current verification keys
- identify which key signed a descriptor or receipt
- rotate keys without breaking active clients
- distinguish demo-only trust models from production-grade ones

## Trust Domain Metadata

MAP key discovery and trust bundle exports include trust metadata:

- `trust_domain` (default `map.local`, configurable via `MAP_TRUST_DOMAIN`)
- `issuer` (default `map.reference`, configurable via `MAP_SIGNING_ISSUER`)

Trust bundle export:

- `GET /trust-bundle/export` returns signed trust metadata plus verification keys and `keys_hash` for offline verifier bootstrap.
- `GET /admin/keys` returns effective key state (active/signable/revoked), runtime revocation metadata, trust metadata, and key-provider details for operator automation.

## Key Discovery

The current HTTP demo exposes:

`GET /.well-known/map-keys`

Example response:

```json
{
  "active_kid": "map-dev-key-1",
  "signing_profile": "symmetric",
  "keys": [
    {
      "kid": "map-dev-key-1",
      "alg": "HS256",
      "use": "sig",
      "status": "active",
      "scopes": ["descriptor", "delegation_token", "receipt", "http_request"],
      "demo_only": true,
      "kty": "oct"
    }
  ]
}
```

For `RS256` keys, entries include `public_key_pem` and (when derivable) a `jwk` object for verifier interoperability.

The endpoint also returns:

- `active_kid`: currently active signing key ID
- `rotation_hints`: cache and refresh guidance for verifiers

Discovery modes:

- default: includes PEM for RSA keys
- `GET /.well-known/map-keys?format=jwk`: JWK-first mode (omits PEM)
- `GET /.well-known/map-keys?include_pem=false`: omits PEM from response
- `GET /.well-known/map-keys?limit=...&cursor=...`: cursor-based pagination

Caching and refresh:

- responses include `ETag`
- clients can send `If-None-Match` to receive `304 Not Modified`

## Current Reference Profile

The reference runtime supports both:

- `HS256` keys (development/demo)
- `RS256` keys (asymmetric signing/verification)

For `RS256`, the discovery payload includes `public_key_pem` so verifiers can validate signatures without private key material.

## Rotation Semantics

MAP providers should eventually support key states such as:

- `active`
- `retiring`
- `revoked`

Expected rotation behavior:

1. publish a new active key
2. sign new artifacts with the new key
3. keep the old key in `retiring` state during a grace window
4. revoke or remove the old key after client migration

In the reference runtime today:

- revoked keys can be declared with `status: "revoked"` in `MAP_SIGNING_KEYS`
- revoked keys can also be force-marked via `MAP_SIGNING_REVOKED_KIDS` (comma-separated `kid` values)
- signatures that resolve to a revoked `kid` are rejected during verification
- runtime revocations are visible via `GET /admin/keys` with `status_source: "runtime_revoked"` and `runtime_revocation` metadata

## Provider Backends (Reference)

Signing key configuration can be sourced from multiple providers:

- `MAP_KEY_PROVIDER=env` (default): read `MAP_SIGNING_KEYS` JSON
- `MAP_KEY_PROVIDER=json_keyset|kms_json`: read `MAP_KMS_KEYSET_JSON`
- `MAP_KEY_PROVIDER=file_keyset|kms_file`: read `MAP_KMS_KEYSET_PATH` JSON file

`GET /status` reports the active provider under `config.signing.key_provider`.

## Recommended Future Direction

Production MAP should standardize:

- asymmetric signing keys
- JWK-style key discovery
- key lifetime and overlap rules
- revocation signaling
- cache guidance for discovery clients
