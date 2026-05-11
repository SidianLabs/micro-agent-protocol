import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { verifyHttpRequestSignature } from "../security/signing.js";
import type { AuthScheme } from "../types.js";
import { normalizePath } from "./utils.js";
import type { createReferenceApp } from "../app.js";

export function getRequiredAuthScheme(
  app: ReturnType<typeof createReferenceApp>,
  targetAgent: string,
  capability: string
): AuthScheme {
  const capabilityDescriptor = app.registry.getCapabilityDescriptor(targetAgent, capability);
  if (capabilityDescriptor?.required_auth_scheme) {
    return capabilityDescriptor.required_auth_scheme;
  }

  return "none";
}

export function getSignedRequestError(
  req: IncomingMessage,
  rawBody: string,
  revokedKeyIds?: Set<string>
): { code: "auth_required" | "invalid_auth" | "token_expired"; message: string } | null {
  const authScheme = req.headers["x-map-auth-scheme"];
  const keyId = req.headers["x-map-key-id"];
  const timestamp = req.headers["x-map-timestamp"];
  const signature = req.headers["x-map-request-signature"];

  if (authScheme !== "signed_request") {
    return {
      code: "auth_required",
      message: "MAP signed_request authentication is required."
    };
  }

  if (
    typeof keyId !== "string" ||
    typeof timestamp !== "string" ||
    typeof signature !== "string"
  ) {
    return {
      code: "invalid_auth",
      message: "Missing MAP signed_request authentication headers."
    };
  }
  if (revokedKeyIds?.has(keyId)) {
    return {
      code: "invalid_auth",
      message: "MAP signed_request key has been revoked."
    };
  }

  const timestampAgeMs = Date.now() - new Date(timestamp).getTime();
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  if (timestampAgeMs > FIVE_MINUTES_MS || timestampAgeMs < -FIVE_MINUTES_MS) {
    return {
      code: "token_expired",
      message: "MAP signed_request timestamp is outside acceptable window."
    };
  }

  const verified = verifyHttpRequestSignature({
    method: req.method ?? "GET",
    path: normalizePath(req.url ?? "/"),
    timestamp,
    key_id: keyId,
    body: rawBody,
    signature
  });

  if (!verified) {
    return {
      code: "invalid_auth",
      message: "Invalid MAP signed_request signature."
    };
  }

  return null;
}

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
  req: IncomingMessage
): { code: string; message: string } | null {
  const authHeader = req.headers["authorization"];

  if (!authHeader || typeof authHeader !== "string" || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      code: "auth_required",
      message: "OAuth 2.0 Bearer token is required."
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      code: "invalid_auth",
      message: "Bearer token is empty."
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
        message: "Invalid OAuth 2.0 Bearer token."
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
        message: "Invalid JWT format in Bearer token."
      };
    }

    let payload: Record<string, unknown>;
    try {
      const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
      payload = JSON.parse(payloadJson);
    } catch {
      return {
        code: "invalid_auth",
        message: "Failed to decode JWT payload."
      };
    }

    if (payload.exp === undefined) {
      return {
        code: "invalid_auth",
        message: "JWT is missing required `exp` claim."
      };
    }

    const exp = typeof payload.exp === "number" ? payload.exp : Number(payload.exp);
    if (!Number.isFinite(exp)) {
      return {
        code: "invalid_auth",
        message: "JWT `exp` claim is not a valid number."
      };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp < nowSeconds) {
      return {
        code: "token_expired",
        message: "OAuth 2.0 Bearer token has expired."
      };
    }

    return null;
  }

  // No token validation method is configured — accept any Bearer token.
  // In production, at least MAP_OAUTH_STATIC_TOKEN or MAP_OAUTH_JWKS_URL should be set.
  return null;
}
