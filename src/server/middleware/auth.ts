/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { verifyHttpRequestSignature } from "../../security/signing.js";
import type { AuthScheme } from "../../types.js";
import type { createReferenceApp } from "../../app.js";
import { normalizePath, wantsSignedRequestAuth } from "../utils.js";

// ─── Required auth scheme ────────────────────────────────────────────────────

export function getRequiredAuthScheme(
  app: ReturnType<typeof createReferenceApp>,
  targetAgent: string,
  capability: string,
): AuthScheme {
  const capabilityDescriptor = app.registry.getCapabilityDescriptor(
    targetAgent,
    capability,
  );
  if (capabilityDescriptor?.required_auth_scheme) {
    return capabilityDescriptor.required_auth_scheme;
  }

  return "none";
}

// ─── Auth result types ────────────────────────────────────────────────────────

export interface AuthError {
  statusCode: number;
  code: string;
  message: string;
}

export interface AuthResult {
  authenticated: boolean;
  error?: AuthError;
  subject?: string;
}

// ─── OAuth 2.0 types ───────────────────────────────────────────────────────────

interface JsonWebKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

interface JwksResponse {
  keys: JsonWebKey[];
}

interface OAuth2TokenResult {
  valid: boolean;
  sub?: string;
  scopes?: string[];
}

interface CachedJwksEntry {
  keys: JsonWebKey[];
  expiresAt: number;
}

const jwksCache = new Map<string, CachedJwksEntry>();

// ─── Signed request auth ──────────────────────────────────────────────────────

export function getSignedRequestError(
  req: IncomingMessage,
  rawBody: string,
  revokedKeyIds?: Set<string>,
): {
  code: "auth_required" | "invalid_auth" | "token_expired";
  message: string;
} | null {
  const authScheme = req.headers["x-map-auth-scheme"];
  const keyId = req.headers["x-map-key-id"];
  const timestamp = req.headers["x-map-timestamp"];
  const signature = req.headers["x-map-request-signature"];

  if (authScheme !== "signed_request") {
    return {
      code: "auth_required",
      message: "MAP signed_request authentication is required.",
    };
  }

  if (
    typeof keyId !== "string" ||
    typeof timestamp !== "string" ||
    typeof signature !== "string"
  ) {
    return {
      code: "invalid_auth",
      message: "Missing MAP signed_request authentication headers.",
    };
  }
  if (revokedKeyIds?.has(keyId)) {
    return {
      code: "invalid_auth",
      message: "MAP signed_request key has been revoked.",
    };
  }

  const timestampAgeMs = Date.now() - new Date(timestamp).getTime();
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  if (timestampAgeMs > FIVE_MINUTES_MS || timestampAgeMs < -FIVE_MINUTES_MS) {
    return {
      code: "token_expired",
      message: "MAP signed_request timestamp is outside acceptable window.",
    };
  }

  const verified = verifyHttpRequestSignature({
    method: req.method ?? "GET",
    path: normalizePath(req.url ?? "/"),
    timestamp,
    key_id: keyId,
    body: rawBody,
    signature,
  });

  if (!verified) {
    return {
      code: "invalid_auth",
      message: "Invalid MAP signed_request signature.",
    };
  }

  return null;
}

// ─── Bearer token auth ────────────────────────────────────────────────────────

/**
 * Validates an OAuth 2.0 Bearer token from the Authorization header.
 *
 * Supports two modes:
 * 1. Static token mode (MAP_OAUTH_STATIC_TOKEN): constant-time comparison using SHA-256 hashing.
 * 2. JWKS mode (MAP_OAUTH_JWKS_URL): basic JWT decoding with `exp` expiration check.
 *    NOTE: Full JWKS validation requires an HTTP fetch to the JWKS endpoint to retrieve
 *    the signing keys and validate the JWT signature. For production use, integrate a
 *    library like `jose` that handles JWKS fetching, caching, and JWT signature validation.
 *
 * Returns null if the token is valid, or an error object if invalid or missing.
 */
export function getBearerTokenError(
  req: IncomingMessage,
): { code: string; message: string } | null {
  const authHeader = req.headers["authorization"];

  if (
    !authHeader ||
    typeof authHeader !== "string" ||
    !authHeader.toLowerCase().startsWith("bearer ")
  ) {
    return {
      code: "auth_required",
      message: "OAuth 2.0 Bearer token is required.",
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      code: "invalid_auth",
      message: "Bearer token is empty.",
    };
  }

  // --- Static token mode (MAP_OAUTH_STATIC_TOKEN) ---
  const staticToken = process.env.MAP_OAUTH_STATIC_TOKEN;
  if (staticToken && staticToken.trim().length > 0) {
    const expectedHash = createHash("sha256").update(staticToken).digest("hex");
    const providedHash = createHash("sha256").update(token).digest("hex");
    if (providedHash !== expectedHash) {
      return {
        code: "invalid_auth",
        message: "Invalid OAuth 2.0 Bearer token.",
      };
    }
    return null;
  }

  // --- JWKS mode (MAP_OAUTH_JWKS_URL) ---
  const jwksUrl = process.env.MAP_OAUTH_JWKS_URL;
  if (jwksUrl) {
    // NOTE: Full JWKS validation would use a library like `jose` to:
    //   1. Fetch the JWKS from MAP_OAUTH_JWKS_URL
    //   2. Cache the keys according to HTTP cache headers
    //   3. Validate the JWT signature using the matching key (by kid)
    //   4. Validate issuer (`iss`), audience (`aud`), and other claims
    //
    // For now, we implement basic JWT decoding and `exp` expiration check.
    // This is NOT sufficient for production use — it does NOT verify the signature.

    const parts = token.split(".");
    if (parts.length !== 3) {
      return {
        code: "invalid_auth",
        message: "Invalid JWT format in Bearer token.",
      };
    }

    let payload: Record<string, unknown>;
    try {
      const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
      payload = JSON.parse(payloadJson);
    } catch {
      return {
        code: "invalid_auth",
        message: "Failed to decode JWT payload.",
      };
    }

    if (payload.exp === undefined) {
      return {
        code: "invalid_auth",
        message: "JWT is missing required `exp` claim.",
      };
    }

    const exp =
      typeof payload.exp === "number" ? payload.exp : Number(payload.exp);
    if (!Number.isFinite(exp)) {
      return {
        code: "invalid_auth",
        message: "JWT `exp` claim is not a valid number.",
      };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp < nowSeconds) {
      return {
        code: "token_expired",
        message: "OAuth 2.0 Bearer token has expired.",
      };
    }

    return null;
  }

  return {
    code: "invalid_auth",
    message:
      "OAuth 2.0 Bearer validation is not configured. Set MAP_OAUTH_STATIC_TOKEN or MAP_OAUTH_JWKS_URL.",
  };
}

// ─── Admin token auth ─────────────────────────────────────────────────────────

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getAdminTokenError(
  req: IncomingMessage,
  rawBody: string,
  getEffectiveRevokedKeyIds: () => Set<string>,
): Promise<{ statusCode: number; code: string; message: string } | null> {
  const configuredToken = process.env.MAP_ADMIN_TOKEN;
  const configuredHash =
    configuredToken && configuredToken.trim().length > 0
      ? hashToken(configuredToken)
      : null;

  if (!configuredHash) {
    return {
      statusCode: 403,
      code: "invalid_auth",
      message: "Admin controls are not enabled.",
    };
  }

  const providedToken = req.headers["x-map-admin-token"];
  if (
    typeof providedToken !== "string" ||
    hashToken(providedToken) !== configuredHash
  ) {
    // Artificial delay to slow brute-force attacks (50-100ms)
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
    return {
      statusCode: 403,
      code: "invalid_auth",
      message: "Invalid admin token.",
    };
  }

  const signedRequestError = getSignedRequestError(
    req,
    rawBody,
    getEffectiveRevokedKeyIds(),
  );
  if (signedRequestError) {
    return {
      statusCode: signedRequestError.code === "auth_required" ? 401 : 403,
      code: signedRequestError.code,
      message: signedRequestError.message,
    };
  }

  return null;
}

// ─── OAuth 2.0 advanced validation ────────────────────────────────────────────

/**
 * Fetches a JWKS (JSON Web Key Set) from the given URL.
 *
 * This is used by {@link validateOAuth2Token} to retrieve public keys for
 * JWT signature verification when `MAP_OAUTH_JWKS_URL` is configured.
 *
 * @param url - The JWKS endpoint URL
 * @returns The array of JSON Web Keys from the JWKS endpoint
 */
export async function getOAuth2Jwks(url: string): Promise<JsonWebKey[]> {
  const now = Date.now();
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.keys;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch JWKS from ${url}: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const jwks: JwksResponse = await response.json();
  if (!jwks || !Array.isArray(jwks.keys)) {
    throw new Error(`Invalid JWKS response from ${url}: missing "keys" array`);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 5 * 60 * 1000;
  jwksCache.set(url, {
    keys: jwks.keys,
    expiresAt: now + ttlMs,
  });
  return jwks.keys;
}

/**
 * Validates an OAuth 2.0 Bearer token (JWT).
 *
 * When `MAP_OAUTH_JWKS_URL` is set, this performs full validation:
 * 1. Decodes the JWT (base64url decode header and payload)
 * 2. Validates `exp` (expiration), `iss` (issuer), and `aud` (audience) claims
 * 3. If the JWKS URL is available and a `kid` header is present, fetches the
 *    matching public key to verify the JWT signature
 *
 * When `MAP_OAUTH_JWKS_URL` is NOT set but `MAP_OAUTH_STATIC_TOKEN` is:
 *    Performs constant-time comparison against the static token.
 *
 * @param token - The Bearer token (may be a JWT or opaque token)
 * @returns Object with `valid` flag and optional `sub` and `scopes` claims
 */
export async function validateOAuth2Token(
  token: string,
): Promise<OAuth2TokenResult> {
  // --- Static token mode ---
  const staticToken = process.env.MAP_OAUTH_STATIC_TOKEN;
  if (staticToken && staticToken.trim().length > 0) {
    const expectedHash = createHash("sha256").update(staticToken).digest("hex");
    const providedHash = createHash("sha256").update(token).digest("hex");
    if (providedHash === expectedHash) {
      return { valid: true };
    }
    return { valid: false };
  }

  const jwksUrl = process.env.MAP_OAUTH_JWKS_URL;
  if (!jwksUrl || jwksUrl.trim().length === 0) {
    return { valid: false };
  }

  // --- JWT validation mode ---
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false };
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return { valid: false };
  }

  // Validate expiration
  if (payload.exp !== undefined) {
    const exp =
      typeof payload.exp === "number" ? payload.exp : Number(payload.exp);
    if (!Number.isFinite(exp)) {
      return { valid: false };
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp < nowSeconds) {
      return { valid: false };
    }
  }

  // Validate issuer if MAP_OAUTH_ISSUER is configured
  const expectedIssuer = process.env.MAP_OAUTH_ISSUER;
  if (expectedIssuer && expectedIssuer.trim().length > 0) {
    const iss = typeof payload.iss === "string" ? payload.iss : undefined;
    if (iss !== expectedIssuer.trim()) {
      return { valid: false };
    }
  }

  // Validate audience if MAP_OAUTH_AUDIENCE is configured
  const expectedAudience = process.env.MAP_OAUTH_AUDIENCE;
  if (expectedAudience && expectedAudience.trim().length > 0) {
    const aud = payload.aud;
    const expected = expectedAudience.trim();
    if (Array.isArray(aud)) {
      if (!aud.includes(expected)) {
        return { valid: false };
      }
    } else if (typeof aud === "string") {
      if (aud !== expected) {
        return { valid: false };
      }
    } else {
      return { valid: false };
    }
  }

  // If JWKS URL is configured, attempt signature verification
  try {
    const keys = await getOAuth2Jwks(jwksUrl);
    const kid = typeof header.kid === "string" ? header.kid : undefined;
    const matchingKey = kid
      ? keys.find((key) => key.kid === kid)
      : keys[0];

    if (!matchingKey) {
      return { valid: false };
    }

    const isVerified = await verifyJwtSignature(
      parts[0],
      parts[1],
      parts[2],
      matchingKey,
    );
    if (!isVerified) {
      return { valid: false };
    }
  } catch {
    return { valid: false };
  }

  // Extract subject and scopes
  const sub: string | undefined =
    typeof payload.sub === "string" ? payload.sub : undefined;

  let scopes: string[] | undefined;
  const scopeClaim = payload.scope ?? payload.scopes;
  if (typeof scopeClaim === "string") {
    scopes = scopeClaim.split(/\s+/).filter(Boolean);
  } else if (Array.isArray(scopeClaim)) {
    scopes = scopeClaim.map((s) => String(s));
  }

  return { valid: true, sub, scopes };
}

/**
 * Verifies a JWT signature using a JWK public key via the Web Crypto API.
 *
 * @internal
 */
async function verifyJwtSignature(
  encodedHeader: string,
  encodedPayload: string,
  encodedSignature: string,
  jwk: JsonWebKey,
): Promise<boolean> {
  try {
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = Buffer.from(encodedSignature, "base64url");

    const algorithm =
      jwk.alg === "RS384" || jwk.alg === "RS512"
        ? {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: `SHA-${jwk.alg.slice(2)}` },
          }
        : jwk.alg === "ES256"
          ? { name: "ECDSA", hash: { name: "SHA-256" } }
          : jwk.alg === "ES384"
            ? { name: "ECDSA", hash: { name: "SHA-384" } }
            : { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } };

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      algorithm,
      false,
      ["verify"],
    );

    return await crypto.subtle.verify(
      algorithm,
      key,
      signature,
      new TextEncoder().encode(signingInput),
    );
  } catch {
    return false;
  }
}

// ─── Helper: extract bearer token ─────────────────────────────────────────────

export function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") return null;
  const lowered = authHeader.toLowerCase();
  if (!lowered.startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

// ─── Auth middleware ───────────────────────────────────────────────────────────

export interface AuthMiddlewareOptions {
  /** If true, enforce signed request auth */
  enforceSignedRequests?: boolean;
  /** If true, enforce bearer token auth as fallback */
  enforceBearerAuth?: boolean;
  /** Required auth scheme from capability descriptor */
  requiredAuthScheme?: string;
  /** Raw request body for signed request verification */
  rawBody?: string;
  /** Set of revoked signing key IDs */
  revokedKeyIds?: Set<string>;
  /** Function to get effective revoked key IDs */
  getEffectiveRevokedKeyIds?: () => Set<string>;
}

/**
 * Cascading authentication middleware for MAP mutation endpoints.
 *
 * Auth precedence:
 * 1. Signed request (x-map-auth-scheme: signed_request)
 * 2. OAuth 2.0 Bearer token (Authorization: Bearer <token>)
 * 3. Admin token (x-map-admin-token)
 *
 * Returns an AuthResult indicating whether the request is authenticated
 * and optionally the authenticated subject.
 */
export async function authMiddleware(
  req: IncomingMessage,
  options: AuthMiddlewareOptions = {},
): Promise<AuthResult> {
  const {
    enforceSignedRequests,
    enforceBearerAuth,
    requiredAuthScheme,
    rawBody = "",
    revokedKeyIds,
    getEffectiveRevokedKeyIds,
  } = options;

  const wantsSigned = wantsSignedRequestAuth(req);
  const effectiveRequiredScheme = enforceSignedRequests
    ? "signed_request"
    : requiredAuthScheme;
  const requiresSignedRequest =
    effectiveRequiredScheme === "signed_request" || wantsSigned;

  // ── Try signed request auth ──
  if (requiresSignedRequest || wantsSigned) {
    const effectiveRevoked = revokedKeyIds ?? getEffectiveRevokedKeyIds?.();
    const signedError = getSignedRequestError(req, rawBody, effectiveRevoked);
    if (signedError === null) {
      // Extract subject from key ID for audit logging
      const keyId = req.headers["x-map-key-id"];
      const subject = typeof keyId === "string" ? `key:${keyId}` : undefined;
      return { authenticated: true, subject };
    }
    // If signed request was explicitly required (not just wanted), return error
    if (requiresSignedRequest && !wantsSigned) {
      // Fall through to bearer token
    } else if (wantsSigned) {
      return {
        authenticated: false,
        error: {
          statusCode: signedError.code === "auth_required" ? 401 : 403,
          code: signedError.code,
          message: signedError.message,
        },
      };
    }
  }

  // ── Try bearer token auth ──
  if (enforceBearerAuth || (!requiresSignedRequest && !wantsSigned)) {
    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
      try {
        const oauth2Result = await validateOAuth2Token(bearerToken);
        if (oauth2Result.valid) {
          const subject = oauth2Result.sub ?? "bearer:authenticated";
          if (oauth2Result.sub) {
            console.log(
              `[MAP] OAuth2 authenticated subject: ${oauth2Result.sub}` +
                (oauth2Result.scopes
                  ? ` (scopes: ${oauth2Result.scopes.join(", ")})`
                  : ""),
            );
          }
          return { authenticated: true, subject };
        }
      } catch {
        // Non-fatal: proceed to next auth method
      }
    }

    const bearerError = getBearerTokenError(req);
    if (bearerError) {
      if (enforceBearerAuth || bearerToken) {
        return {
          authenticated: false,
          error: {
            statusCode: bearerError.code === "auth_required" ? 401 : 403,
            code: bearerError.code,
            message: bearerError.message,
          },
        };
      }
    }
  }

  // ── Try admin token auth (lowest priority) ──
  const adminToken = req.headers["x-map-admin-token"];
  if (typeof adminToken === "string" && adminToken.trim().length > 0) {
    const effectiveRevoked =
      revokedKeyIds ?? getEffectiveRevokedKeyIds?.() ?? new Set();
    const adminError = await getAdminTokenError(
      req,
      rawBody,
      () => effectiveRevoked,
    );
    if (adminError === null) {
      return { authenticated: true, subject: "admin:authenticated" };
    }
  }

  // ── Not authenticated ──
  return {
    authenticated: false,
    error: {
      statusCode: 401,
      code: "auth_required",
      message: "Authentication is required.",
    },
  };
}
