# Security Guide

This guide covers authentication, key management, and trust models in MAP Protocol.

## Authentication

MAP supports multiple authentication schemes to fit different security requirements.

### Authentication Schemes

| Scheme | Description | Security Level |
|--------|-------------|-----------------|
| `none` | No authentication | Development only |
| `bearer` | JWT Bearer tokens | Standard |
| `mtls` | Mutual TLS | High |
| `signed_request` | HMAC/RSA signed requests | High |

### Bearer Tokens

Bearer token authentication uses JWT tokens for identity verification:

```typescript
// TypeScript
const client = MapAssistantClient.forBaseUrl(url);
client.configureAuth({
  scheme: 'bearer',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});
```

```python
# Python
client = Client(base_url=url)
client.configure_auth(scheme='bearer', token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
```

```go
// Go
client := mapproto.NewClient(url)
client.ConfigureAuth(&types.AuthConfig{
    Scheme: "bearer",
    Token:  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
})
```

### Signed Requests (HMAC)

HMAC signing provides request integrity without key exchange:

```typescript
MAP/src/src/security/signing.ts#L485-493
function signHttpRequest(request: SignedRequestPayload): Record<string, string> {
  const signature = createCompactSignature(signingKey, signedRequestPayload(request));
  return {
    "x-map-auth-scheme": "signed_request",
    "x-map-key-id": request.key_id,
    "x-map-timestamp": request.timestamp,
    "x-map-request-signature": signature
  };
}
```

**Required Headers:**

| Header | Description | Example |
|--------|-------------|---------|
| `x-map-auth-scheme` | Authentication scheme | `signed_request` |
| `x-map-key-id` | Key identifier | `kid_prod_001` |
| `x-map-timestamp` | ISO 8601 timestamp | `2024-01-15T10:30:00Z` |
| `x-map-request-signature` | Base64URL signature | `eyJhbGciOiJIUzI1NiJ9...` |

**Creating a Signed Request (TypeScript):**

```typescript
import { signHttpRequest } from '@mapprotocol/sdk';

const headers = signHttpRequest({
  method: 'POST',
  path: '/dispatch',
  timestamp: new Date().toISOString(),
  key_id: process.env.MAP_KEY_ID!,
  body: JSON.stringify(requestBody)
});

await fetch('/dispatch', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...headers
  },
  body: JSON.stringify(requestBody)
});
```

### Signed Requests (RSA)

RSA signatures provide non-repudiation for regulated environments:

```typescript
MAP/src/src/security/signing.ts#L253-264
const signature = sign(Buffer.from(signingInput), signingKey.material.private_key_pem, "RSA-SHA256");
```

**Generating RSA Keys:**

```bash
# Generate 2048-bit RSA key pair
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Convert to PEM format for MAP
cat private.pem | base64
cat public.pem | base64
```

**Environment Configuration:**

```bash
# MAP_SIGNING_KEYS JSON
MAP_SIGNING_KEYS='[{
  "kid": "kid_prod_rs",
  "alg": "RS256",
  "private_key_pem": "base64_encoded_private_key",
  "public_key_pem": "base64_encoded_public_key",
  "status": "active",
  "demo_only": false
}]'
MAP_SIGNING_ACTIVE_KID=kid_prod_rs
```

### mTLS (Mutual TLS)

For high-security deployments, mTLS provides both client and server authentication:

```bash
# Generate client certificate
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -out client.crt -days 365

# Configure in deployment
MTLS_CERT_PATH=/path/to/client.crt
MTLS_KEY_PATH=/path/to/client.key
MTLS_CA_PATH=/path/to/ca.crt
```

---

## Key Management

### Key Generation

#### HMAC Keys

```typescript
// TypeScript - using Node.js crypto
import { randomBytes, createHmac } from 'node:crypto';

const secret = randomBytes(32).toString('base64url');
console.log('HMAC Secret:', secret);
```

#### RSA Keys

```typescript
// TypeScript - using Node.js crypto
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048  // Minimum for production
});

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
```

### Key Rotation

Keys should be rotated periodically. MAP supports gradual key rotation:

```typescript
MAP/src/src/security/signing.ts#L108-178
function getSigningKeys(): SigningKey[] {
  const revokedKids = getRevokedKidsFromEnv();
  const providerKeys = JSON.parse(process.env.MAP_SIGNING_KEYS ?? "[]");
  
  const keys = providerKeys.map((key: Record<string, unknown>) => {
    const alg = key.alg as string;
    const status = revokedKids.has(key.kid as string) ? "revoked" : (key.status as string);
    // ... process key material
  });
  
  return keys.filter(k => k.status !== "revoked");
}
```

**Rotation Procedure:**

1. Generate new key with unique `kid`
2. Add new key to `MAP_SIGNING_KEYS` alongside old key
3. Update `MAP_SIGNING_ACTIVE_KID` to new key
4. Wait for in-flight requests to complete
5. Revoke old key via `MAP_SIGNING_KEYS_REVOKED`

```bash
# Example: Rotating from kid_old to kid_new
export MAP_SIGNING_KEYS='[
  {"kid": "kid_new", "alg": "RS256", ...},
  {"kid": "kid_old", "alg": "RS256", ..., "status": "active"}
]'
export MAP_SIGNING_ACTIVE_KID=kid_new

# After grace period, revoke old key
export MAP_SIGNING_KEYS_REVOKED=kid_old
```

### Key Revocation

Revoke compromised keys immediately:

```bash
# Revoke by adding to revoked list
export MAP_SIGNING_KEYS_REVOKED=kid_compromised_001,kid_compromised_002
```

### HSM Integration

For production environments requiring HSM (Hardware Security Module):

```typescript
// Example HSM provider interface
interface HSMProvider {
  sign(keyId: string, payload: string, algorithm: string): Promise<string>;
  getPublicKey(keyId: string): Promise<string>;
  verify(keyId: string, payload: string, signature: string): Promise<boolean>;
}

// Configuration
export MAP_HSM_ENABLED=true
export MAP_HSM_PROVIDER=aws-kms  # or: azure-keyvault, hashicorp-vault
export MAP_HSM_CONFIG='{"endpoint": "https://kms.amazonaws.com", "keyId": "alias/map-signing"}'
```

---

## Trust Model

### Trust Domains

MAP separates trust into distinct domains:

```
┌─────────────────────────────────────────────────────────────┐
│  Trust Domain: External Assistant                            │
│  (User-facing agent - NOT trusted by MAP)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ Trust Boundary
┌─────────────────────────────────────────────────────────────┐
│  Trust Domain: MAP Control Plane                             │
│  - Validates all requests                                   │
│  - Enforces policy                                          │
│  - Issues delegation tokens                                 │
│  - Signs receipts                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ Trust Boundary
┌─────────────────────────────────────────────────────────────┐
│  Trust Domain: Micro-Agent Runtime                          │
│  - Executes tasks locally                                   │
│  - Accesses internal resources                              │
│  - Returns redacted results                                 │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Profiles

| Profile | Trust Level | Signing | Tenant Required |
|---------|-------------|---------|----------------|
| Open | Development | Optional | No |
| Verified | Enterprise | Required (HMAC/RSA) | Yes |
| Regulated | Compliance | Required (RSA only) | Yes |

### Audit Trails

All operations are recorded for audit:

```typescript
MAP/src/src/security/signing.ts#L557-562
interface AuditCheckpointPayload {
  checkpoint_id: string;
  created_at: string;
  last_chain_index: number;
  last_event_hash: string;
}
```

**Verifying Audit Chain:**

```bash
# Export audit log
curl -X GET https://api.map-protocol.dev/v1/audit-events/export \
  -H "x-map-request-signature: ..."

# Verify cryptographic integrity
curl -X GET https://api.map-protocol.dev/v1/audit-events/verify \
  -H "x-map-request-signature: ..."
```

**Export Response:**

```json
{
  "ok": true,
  "data": {
    "export_id": "exp_abc123",
    "created_at": "2024-01-15T10:30:00Z",
    "events_count": 1523,
    "checkpoints_count": 15,
    "signature": "sig_...",
    "events": [...],
    "checkpoints": [...]
  }
}
```

---

## Security Checklist

### Pre-Deployment

- [ ] Generate RSA-2048 keys for production
- [ ] Configure key storage (HSM recommended)
- [ ] Set up signing key rotation schedule
- [ ] Configure `MAP_SIGNING_ACTIVE_KID`
- [ ] Review trust domain boundaries
- [ ] Enable TLS 1.2+ only
- [ ] Configure rate limiting

### Authentication

- [ ] Choose authentication scheme per deployment profile
- [ ] For `verified` profile: require signed requests
- [ ] For `regulated` profile: require RSA signatures
- [ ] Implement key rotation procedure
- [ ] Set up key revocation process

### Audit

- [ ] Configure audit event retention period
- [ ] Set up audit log export schedule
- [ ] Verify audit chain integrity regularly
- [ ] Configure alert thresholds

### Monitoring

- [ ] Set up alerts for authentication failures
- [ ] Monitor key expiration dates
- [ ] Track request signature validation failures
- [ ] Monitor rate limit violations

---

## Next Steps

- [Deployment Guide](./deployment.md) - Production deployment with security configuration
- [Policy Configuration](./policy-guide.md) - Policy-based access control
- [Protocol Specification](./protocol-spec.md) - Complete protocol details
