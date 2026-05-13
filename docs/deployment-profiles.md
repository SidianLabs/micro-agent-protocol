# MAP Deployment Profiles

## Purpose

MAP deployment profiles define increasing security/governance requirements without changing the protocol surface.

## Profiles

### `open`

Use for local development and rapid prototyping.

- Signed requests: optional
- Tenant requirement: optional
- Signing keys: demo/dev keys allowed

### `verified`

Use for controlled environments where transport/request trust must be enforced.

- Signed requests: required
- Tenant requirement: optional
- Active signing key algorithm: `RS256`
- Signable keyring: asymmetric-only (`RS256`), no demo keys

### `regulated`

Use for high-assurance environments (finance, healthcare, critical enterprise operations).

- Signed requests: required
- Tenant requirement: required
- Active signing key algorithm: `RS256`
- Signable keyring: asymmetric-only (`RS256`), no demo keys

## Runtime Behavior

The profile is configured via:

- `MAP_DEPLOYMENT_PROFILE=open|verified|regulated`

Profile evaluation is exposed in:

- `GET /health` → `checks.deployment_profile`
- `GET /ready` → `checks.deployment_profile`
- `GET /status` → `config.deployment_profile`

`/ready` returns `503` when profile requirements are not satisfied.

## Notes

- This mechanism enforces baseline posture and prevents unsafe runtime drift.
- It does not replace policy rules, approval checks, tenant filtering, or token scope checks.

## Conformance

You can validate profile behavior with:

```bash
npm run conformance:profiles
```

This suite checks:

1. `open` allows unsigned dispatch
2. `verified` rejects unsigned dispatch and requires signed `RS256` non-demo keys
3. `regulated` fails readiness when constraints are violated
4. `regulated` passes with signed RS256 + tenant-required configuration
