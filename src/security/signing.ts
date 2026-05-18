/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  AgentDescriptor,
  AnomalyReport,
  DelegationToken,
  ExecutionReceipt,
  MapSignedRequestHeaders,
  MapVerificationKey,
  TrustAnchor,
} from "../types.js";
import {
  getKeyProviderInfo,
  getSigningKeyConfigsFromProvider,
} from "./key-provider.js";
import {
  resolveKMSProvider,
  resetKMSProvider,
  setKMSKeyLoader,
  type KMSProvider,
} from "./kms-provider.js";

const DEFAULT_KID = "map-dev-key-1";
const DEFAULT_ALG = "HS256";
const DEFAULT_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
const nonceCache = new Map<string, number>();
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;

// Ephemeral key material — generated once per process, memoized
let _ephemeralSecret: string | undefined;
let _ephemeralUUID: string | undefined;

function randomBytesForEphemeral(): string {
  if (!_ephemeralSecret) {
    _ephemeralSecret = randomBytes(32).toString("base64url");
  }
  return _ephemeralSecret;
}

function randomUUIDForEphemeral(): string {
  if (!_ephemeralUUID) {
    _ephemeralUUID = randomUUID();
  }
  return _ephemeralUUID;
}

/** Reset ephemeral key state (for testing only). */
export function _resetEphemeralKey(): void {
  _ephemeralSecret = undefined;
  _ephemeralUUID = undefined;
}

const DEFAULT_SCOPES = [
  "descriptor",
  "delegation_token",
  "receipt",
  "http_request",
  "audit_checkpoint",
  "audit_export",
  "conformance_export",
  "trust_bundle",
];

/**
 * Crypto observability metrics for detecting key misuse and anomalous
 * signing/verification patterns.
 */
export const signatureMetrics = {
  totalSignatures: 0,
  failedVerifications: 0,
  byKeyId: new Map<
    string,
    { signed: number; verified: number; failed: number }
  >(),
  byAlgorithm: new Map<string, number>(),
  lastSignature: null as string | null,
};

const KEY_USE_CONSTRAINTS: Record<string, SignatureScope[]> = {
  agent_descriptor: ["descriptor"],
  delegation_token: ["delegation_token"],
  execution_receipt: ["receipt"],
  http_request: ["http_request"],
  audit_checkpoint: ["audit_checkpoint"],
  audit_export: ["audit_export"],
  conformance_export: ["conformance_export"],
  trust_bundle: ["trust_bundle"],
};

function getDeploymentProfile(): "open" | "verified" | "regulated" {
  const profile = process.env.MAP_DEPLOYMENT_PROFILE;
  if (profile === "verified" || profile === "regulated") {
    return profile;
  }
  return "open";
}

function assertValidKeyUse(artifactType: string, scope: SignatureScope): void {
  const allowedScopes = KEY_USE_CONSTRAINTS[artifactType];
  if (!allowedScopes) {
    throw new Error(
      `Unknown artifact type: ${artifactType}. Cannot assert key-use constraints.`,
    );
  }
  if (!allowedScopes.includes(scope)) {
    throw new Error(
      `Key scope "${scope}" is not allowed for artifact type "${artifactType}". Allowed scopes: ${allowedScopes.join(", ")}`,
    );
  }
}

function getAllowedAlgorithms(
  profile: "open" | "verified" | "regulated",
): ("HS256" | "RS256")[] {
  switch (profile) {
    case "open":
      return ["HS256", "RS256"];
    case "verified":
      return ["RS256"];
    case "regulated":
      return ["RS256"];
    default:
      return ["HS256", "RS256"];
  }
}

function assertAlgorithmAllowed(alg: string, profile: string): void {
  const allowed = getAllowedAlgorithms(
    profile as "open" | "verified" | "regulated",
  );
  if (!allowed.includes(alg as "HS256" | "RS256")) {
    throw new Error(
      `Algorithm "${alg}" is not allowed for deployment profile "${profile}". Allowed algorithms: ${allowed.join(", ")}`,
    );
  }
  // For regulated profile, RSA is required (key-length enforced at key-material validation).
  if (profile === "regulated" && alg === "RS256") {
    // assertion only — actual enforcement happens during key-material validation
  } else if (profile === "regulated") {
    throw new Error(`regulated profile requires RS256, got ${alg}`);
  }
}

type SignatureScope =
  | "descriptor"
  | "delegation_token"
  | "receipt"
  | "http_request"
  | "audit_checkpoint"
  | "audit_export"
  | "conformance_export"
  | "trust_bundle";

interface SigningHeader {
  alg: "HS256" | "RS256";
  kid: string;
  typ: "MAPSIG";
}

export interface TrustMetadata {
  trust_domain: string;
  issuer: string;
  profile: "open" | "verified" | "regulated";
}

interface SigningKey {
  kid: string;
  alg: "HS256" | "RS256";
  status: "active" | "retiring" | "revoked";
  scopes: string[];
  demo_only: boolean;
  material:
    | { type: "hmac"; secret: string }
    | { type: "rsa"; private_key_pem?: string; public_key_pem: string };
}

function getRevokedKidsFromEnv(): Set<string> {
  const raw = process.env.MAP_SIGNING_REVOKED_KIDS;
  if (!raw || raw.trim().length === 0) {
    return new Set<string>();
  }

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function getDefaultSigningKey(): SigningKey {
  const secret = process.env.MAP_SIGNING_SECRET;
  if (secret) {
    return {
      kid: DEFAULT_KID,
      alg: "HS256",
      status: "active",
      scopes: DEFAULT_SCOPES,
      demo_only: true,
      material: {
        type: "hmac",
        secret,
      },
    };
  }

  const profile = getDeploymentProfile();
  if (profile !== "open") {
    throw new Error(
      "MAP_SIGNING_SECRET must be configured for verified/regulated profiles.",
    );
  }

  // Fail-closed if MAP_REQUIRE_SIGNING_SECRET=true
  if (process.env.MAP_REQUIRE_SIGNING_SECRET === "true") {
    throw new Error(
      "MAP_REQUIRE_SIGNING_SECRET is set but MAP_SIGNING_SECRET is not configured. " +
      "Refusing to start with ephemeral key. Set MAP_SIGNING_SECRET for stable signing.",
    );
  }

  // Generate ephemeral per-process key — receipts cannot be verified after restart
  const ephemeralSecret = randomBytesForEphemeral();
  const shortId = randomUUIDForEphemeral().slice(0, 8);
  const ephemeralKid = `map-ephemeral-${shortId}`;

  console.warn(
    `WARNING: Using ephemeral signing key kid=${ephemeralKid}. ` +
    `Receipts signed by this process cannot be verified after restart. ` +
    `Set MAP_SIGNING_SECRET for stable signing.`,
  );

  return {
    kid: ephemeralKid,
    alg: "HS256",
    status: "active",
    scopes: DEFAULT_SCOPES,
    demo_only: true,
    material: {
      type: "hmac",
      secret: ephemeralSecret,
    },
  };
}

/**
 * Returns all signing keys, including those configured via environment
 * variables, file-based key sets, and the default dev key.
 *
 * After keys are loaded, the KMS provider key loader is updated so that
 * LocalKMSProvider stays in sync with the configured key material.
 */
function getSigningKeys(): SigningKey[] {
  const revokedKids = getRevokedKidsFromEnv();
  const providerKeys = getSigningKeyConfigsFromProvider();
  let result: SigningKey[];
  if (providerKeys.length === 0) {
    const key = getDefaultSigningKey();
    result = revokedKids.has(key.kid) ? [{ ...key, status: "revoked" }] : [key];
  } else {
    try {
      const keys = providerKeys
        .filter(
          (key) =>
            key && typeof key.kid === "string" && key.kid.trim().length > 0,
        )
        .map((key): SigningKey | null => {
          const alg: SigningKey["alg"] =
            key.alg === "RS256" ? "RS256" : "HS256";
          const status: SigningKey["status"] =
            key.status === "revoked"
              ? "revoked"
              : key.status === "retiring"
                ? "retiring"
                : "active";
          const base = {
            kid: key.kid.trim(),
            alg,
            status,
            scopes:
              Array.isArray(key.scopes) && key.scopes.length > 0
                ? key.scopes
                : DEFAULT_SCOPES,
            demo_only: key.demo_only ?? false,
          };

          if (alg === "RS256") {
            if (
              typeof key.public_key_pem !== "string" ||
              key.public_key_pem.trim().length === 0
            ) {
              return null;
            }
            return {
              ...base,
              material: {
                type: "rsa",
                public_key_pem: key.public_key_pem,
                private_key_pem:
                  typeof key.private_key_pem === "string" &&
                  key.private_key_pem.trim().length > 0
                    ? key.private_key_pem
                    : undefined,
              },
            };
          }

          if (typeof key.secret !== "string" || key.secret.length === 0) {
            return null;
          }
          return {
            ...base,
            material: {
              type: "hmac",
              secret: key.secret,
            },
          };
        })
        .filter((key): key is SigningKey => Boolean(key));

      const normalized = keys.length > 0 ? keys : [getDefaultSigningKey()];
      result = normalized.map((key) =>
        revokedKids.has(key.kid) ? { ...key, status: "revoked" } : key,
      );
    } catch {
      const key = getDefaultSigningKey();
      result = revokedKids.has(key.kid)
        ? [{ ...key, status: "revoked" }]
        : [key];
    }
  }

  // Bridge: keep the LocalKMSProvider in sync with the current key material.
  // This is a no-op when another KMS provider (env, aws_kms, vault) is active.
  try {
    setKMSKeyLoader(() => result);
  } catch {
    // Silently ignore if the kms-provider module isn't fully initialized yet.
  }

  return result;
}

function getSigningKeyByKid(kid: string): SigningKey | undefined {
  return getSigningKeys().find((key) => key.kid === kid);
}

function getActiveSigningKey(): SigningKey {
  const keys = getSigningKeys();
  const activeKid = process.env.MAP_SIGNING_ACTIVE_KID;
  if (typeof activeKid === "string" && activeKid.trim().length > 0) {
    const byKid = keys.find((key) => key.kid === activeKid.trim());
    if (byKid && byKid.status !== "revoked") {
      return byKid;
    }
  }
  const firstSignable = keys.find((key) => key.status !== "revoked");
  if (firstSignable) {
    return firstSignable;
  }
  throw new Error("No active signing key available (all keys are revoked).");
}

function getRequestMaxAgeMs(): number {
  const value = Number(
    process.env.MAP_REQUEST_MAX_AGE_MS ?? DEFAULT_REQUEST_MAX_AGE_MS,
  );
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_REQUEST_MAX_AGE_MS;
}

export function generateNonce(): string {
  return crypto.randomUUID();
}

export function verifyNonce(nonce: string, maxAgeMs?: number): boolean {
  const effectiveMaxAge = maxAgeMs ?? NONCE_MAX_AGE_MS;
  const now = Date.now();

  // Prune old entries
  for (const [key, timestamp] of nonceCache.entries()) {
    if (now - timestamp > effectiveMaxAge) {
      nonceCache.delete(key);
    }
  }

  if (nonceCache.has(nonce)) {
    return false; // replay detected
  }

  nonceCache.set(nonce, now);
  return true;
}
function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

/**
 * Serializes a number in a format compliant with RFC 8785 JCS.
 *
 * RFC 8785 requires:
 * - No exponential notation
 * - No leading zeros (except for "0" and decimal fractions like "0.5")
 * - At most one leading minus sign
 * - Decimal point only when necessary
 * - No trailing zeros after the decimal point
 */
function serializeJcsNumber(n: number): string {
  if (!Number.isFinite(n)) {
    return "null"; // Infinity, NaN → null per JCS
  }

  if (n === 0) {
    return "0"; // Normalize -0 to 0
  }

  // For integers within the safe range where toString() never produces exponential
  // notation (|n| < 1e21), use the native toString().
  if (Number.isInteger(n) && Math.abs(n) < 1e21) {
    return n.toString();
  }

  // For non-integers or very large numbers, use toFixed with sufficient precision
  // and strip trailing zeros. This avoids exponential notation.
  // We use 15 significant digits (max safe decimal precision for IEEE 754 doubles).
  let str: string;
  const absN = Math.abs(n);

  if (absN >= 1e21) {
    // Very large integer — use toFixed(0) to avoid exponential notation
    str = n.toFixed(0);
  } else if (absN < 1e-6 && absN > 0) {
    // Very small fraction — use toFixed with enough places to capture precision
    str = n.toFixed(15);
    // Strip trailing zeros
    str = str.replace(/0+$/, "");
    if (str.endsWith(".")) {
      str = str.slice(0, -1);
    }
  } else {
    // General case: use toFixed(15) and strip trailing zeros
    str = n.toFixed(15);
    str = str.replace(/0+$/, "");
    if (str.endsWith(".")) {
      str = str.slice(0, -1);
    }
  }

  return str;
}

/**
 * Recursively serializes a value according to RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * Rules:
 * - Object keys are sorted lexicographically
 * - No insignificant whitespace
 * - Numbers use non-exponential notation
 * - Strings are escaped per JSON spec (using JSON.stringify)
 * - null, boolean values serialized as "null", "true", "false"
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8785
 */
function serializeJcs(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return serializeJcsNumber(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => serializeJcs(item));
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const items = keys.map(
      (key) =>
        `${JSON.stringify(key)}:${serializeJcs((value as Record<string, unknown>)[key])}`,
    );
    return `{${items.join(",")}}`;
  }

  return JSON.stringify(value);
}

/**
 * Canonicalizes a JSON string according to RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * This implements the same approach used by the A2A protocol for descriptor signing:
 * 1. Parse the JSON string into an object
 * 2. Re-serialize with JCS rules (sorted keys, no whitespace, consistent number formatting)
 *
 * The resulting string is deterministic — the same logical JSON always produces the same
 * canonical form, making it safe for hashing and signing.
 *
 * @param input - A valid JSON string
 * @returns The canonicalized JSON string per RFC 8785
 * @see https://datatracker.ietf.org/doc/html/rfc8785
 */
export function canonicalize(input: string): string {
  const parsed = JSON.parse(input);
  return serializeJcs(parsed);
}

function stableStringify(value: unknown): string {
  // Delegate to JCS serialization for consistent, canonical output.
  // This ensures all MAP signatures use the same deterministic serialization.
  return serializeJcs(value);
}

/**
 * Signs a pre-canonicalized payload string.
 *
 * Unlike {@link createCompactSignature}, this accepts an already-serialized
 * payload string (e.g., from {@link canonicalize}) and signs it directly
 * without further stringification.  This is the preferred path for payloads
 * that must be canonicalized per RFC 8785 JCS before signing.
 */
function createCompactSignatureFromCanonical(
  canonicalPayload: string,
  requestedKid?: string,
  scope?: SignatureScope,
): string {
  const signingKey =
    typeof requestedKid === "string" && requestedKid.trim().length > 0
      ? getSigningKeyByKid(requestedKid.trim())
      : getActiveSigningKey();
  if (!signingKey) {
    throw new Error("No signing key found for requested kid.");
  }
  if (signingKey.status === "revoked") {
    throw new Error(`Requested signing key is revoked: ${signingKey.kid}`);
  }
  if (scope && !signingKey.scopes.includes(scope)) {
    throw new Error(
      `Signing key ${signingKey.kid} is not authorized for scope ${scope}.`,
    );
  }

  // Enforce algorithm policy by deployment profile
  const profile = getDeploymentProfile();
  assertAlgorithmAllowed(signingKey.alg, profile);

  // Increment crypto observability metrics
  signatureMetrics.totalSignatures += 1;
  signatureMetrics.lastSignature = new Date().toISOString();
  signatureMetrics.byAlgorithm.set(
    signingKey.alg,
    (signatureMetrics.byAlgorithm.get(signingKey.alg) ?? 0) + 1,
  );
  const keyStats = signatureMetrics.byKeyId.get(signingKey.kid) ?? {
    signed: 0,
    verified: 0,
    failed: 0,
  };
  keyStats.signed += 1;
  signatureMetrics.byKeyId.set(signingKey.kid, keyStats);

  const header: SigningHeader = {
    alg: signingKey.alg,
    kid: signingKey.kid,
    typ: "MAPSIG",
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(canonicalPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature =
    signingKey.material.type === "hmac"
      ? createHmac("sha256", signingKey.material.secret)
          .update(signingInput)
          .digest("base64url")
      : (() => {
          if (!signingKey.material.private_key_pem) {
            throw new Error(
              `No private key configured for signing kid: ${signingKey.kid}`,
            );
          }
          const signer = createSign("RSA-SHA256");
          signer.update(signingInput);
          signer.end();
          return signer
            .sign(createPrivateKey(signingKey.material.private_key_pem))
            .toString("base64url");
        })();
  return `${signingInput}.${signature}`;
}

function createCompactSignature(
  payload: Record<string, unknown>,
  requestedKid?: string,
  scope?: SignatureScope,
): string {
  return createCompactSignatureFromCanonical(
    stableStringify(payload),
    requestedKid,
    scope,
  );
}

/**
 * Verifies a compact signature against a pre-canonicalized payload string.
 *
 * Unlike {@link verifyCompactSignature}, this accepts an already-serialized
 * canonical payload string and compares it directly against the payload
 * embedded in the signature.
 */
function verifyCompactSignatureFromCanonical(
  signature: string,
  canonicalPayload: string,
  scope?: SignatureScope,
): boolean {
  const parts = signature.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  let parsedHeader: SigningHeader | undefined;
  try {
    parsedHeader = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    ) as SigningHeader;
  } catch {
    return false;
  }
  if (
    !parsedHeader ||
    parsedHeader.typ !== "MAPSIG" ||
    (parsedHeader.alg !== "HS256" && parsedHeader.alg !== "RS256")
  ) {
    return false;
  }
  const signingKey = getSigningKeyByKid(parsedHeader.kid);
  if (
    !signingKey ||
    signingKey.status === "revoked" ||
    signingKey.alg !== parsedHeader.alg
  ) {
    return false;
  }
  if (scope && !signingKey.scopes.includes(scope)) {
    return false;
  }

  const expectedPayload = base64url(canonicalPayload);
  if (encodedPayload !== expectedPayload) {
    recordVerificationMetric(parsedHeader.kid, parsedHeader.alg, false);
    return false;
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  if (signingKey.material.type === "hmac") {
    const expectedSignature = createHmac("sha256", signingKey.material.secret)
      .update(signingInput)
      .digest("base64url");

    try {
      const ok = timingSafeEqual(
        Buffer.from(providedSignature, "base64url"),
        Buffer.from(expectedSignature, "base64url"),
      );
      recordVerificationMetric(parsedHeader.kid, parsedHeader.alg, ok);
      return ok;
    } catch {
      // timingSafeEqual throws on length mismatch.
      // Perform a dummy constant-time comparison to avoid leaking length.
      const dummy = Buffer.from(expectedSignature, "base64url");
      try {
        timingSafeEqual(dummy, dummy);
      } catch {
        /* never throws for equal-length */
      }
      recordVerificationMetric(parsedHeader.kid, parsedHeader.alg, false);
      return false;
    }
  }

  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signingInput);
    verifier.end();
    const ok = verifier.verify(
      createPublicKey(signingKey.material.public_key_pem),
      Buffer.from(providedSignature, "base64url"),
    );
    recordVerificationMetric(parsedHeader.kid, parsedHeader.alg, ok);
    return ok;
  } catch {
    recordVerificationMetric(parsedHeader.kid, parsedHeader.alg, false);
    return false;
  }
}

function verifyCompactSignature(
  signature: string,
  payload: Record<string, unknown>,
  scope?: SignatureScope,
): boolean {
  return verifyCompactSignatureFromCanonical(
    signature,
    stableStringify(payload),
    scope,
  );
}

function recordVerificationMetric(
  kid: string,
  alg: "HS256" | "RS256",
  ok: boolean,
): void {
  const keyStats = signatureMetrics.byKeyId.get(kid) ?? {
    signed: 0,
    verified: 0,
    failed: 0,
  };
  if (ok) {
    keyStats.verified += 1;
  } else {
    keyStats.failed += 1;
    signatureMetrics.failedVerifications += 1;
  }
  signatureMetrics.byKeyId.set(kid, keyStats);
}

export function getSignatureKeyId(signature: string): string | null {
  const parts = signature.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const parsedHeader = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as Partial<SigningHeader>;
    if (parsedHeader.typ !== "MAPSIG" || typeof parsedHeader.kid !== "string") {
      return null;
    }
    return parsedHeader.kid;
  } catch {
    return null;
  }
}

function getSignatureAlgorithm(signature: string): "HS256" | "RS256" | null {
  const parts = signature.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const parsedHeader = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as Partial<SigningHeader>;
    if (
      parsedHeader.typ !== "MAPSIG" ||
      (parsedHeader.alg !== "HS256" && parsedHeader.alg !== "RS256")
    ) {
      return null;
    }
    return parsedHeader.alg;
  } catch {
    return null;
  }
}

function tokenSigningPayload(
  token: Omit<DelegationToken, "signature">,
): Record<string, unknown> {
  return {
    issuer: token.issuer,
    subject_agent: token.subject_agent,
    allowed_actions: token.allowed_actions,
    resource_scope: token.resource_scope,
    constraints: token.constraints,
    approval_reference: token.approval_reference ?? null,
    requester_identity: token.requester_identity ?? null,
  };
}

/**
 * Returns the canonicalized JSON string for an AgentDescriptor payload.
 *
 * Uses RFC 8785 JCS (via {@link canonicalize}) to produce a deterministic
 * serialization of the descriptor that is safe for hashing and signing.
 * This matches the approach used by the A2A protocol.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8785
 */
function descriptorSigningPayload(
  descriptor: Omit<
    AgentDescriptor,
    "descriptor_signature" | "descriptor_key_id" | "descriptor_signature_alg"
  >,
): string {
  // Build the raw payload object, then canonicalize per RFC 8785 JCS.
  const raw: Record<string, unknown> = {
    ...descriptor,
  };
  return canonicalize(JSON.stringify(raw));
}

function receiptSigningPayload(
  receipt: Omit<ExecutionReceipt, "signature">,
): Record<string, unknown> {
  return {
    receipt_id: receipt.receipt_id,
    intent_id: receipt.intent_id,
    capability: receipt.capability,
    action: receipt.action,
    timestamp: receipt.timestamp,
    status: receipt.status,
    // Protocol-level optional fields (included when present for stable canonicalization)
    task_id: receipt.task_id ?? null,
    tenant_id: receipt.tenant_id ?? null,
    request_id: receipt.request_id ?? null,
    agent_id: receipt.agent_id ?? null,
    resource_touched: receipt.resource_touched ?? null,
    policy_checks: receipt.policy_checks ?? null,
    approval_used: receipt.approval_used ?? null,
    result_hash: receipt.result_hash ?? null,
    requested_schema_version: receipt.requested_schema_version ?? null,
    executed_schema_version: receipt.executed_schema_version ?? null,
    negotiation: receipt.negotiation ?? null,
  };
}

export function signDelegationToken(
  token: Omit<DelegationToken, "signature">,
): string {
  assertValidKeyUse("delegation_token", "delegation_token");
  return createCompactSignature(
    tokenSigningPayload(token),
    undefined,
    "delegation_token",
  );
}

export function verifyDelegationTokenSignature(
  token: DelegationToken,
): boolean {
  const { signature, ...unsignedToken } = token;
  return verifyCompactSignature(
    signature,
    tokenSigningPayload(unsignedToken),
    "delegation_token",
  );
}

export function signReceipt(
  receipt: Omit<ExecutionReceipt, "signature">,
): string {
  assertValidKeyUse("execution_receipt", "receipt");
  return createCompactSignature(
    receiptSigningPayload(receipt),
    undefined,
    "receipt",
  );
}

/**
 * Signs an AgentDescriptor using RFC 8785 JCS canonicalization.
 *
 * The descriptor is first converted to a JSON string, then canonicalized
 * per RFC 8785 before signing. This ensures the same logical descriptor
 * always produces the same signature, regardless of JSON key order or
 * whitespace in the input.
 *
 * This matches the approach used by the A2A protocol for descriptor signing.
 */
export function signAgentDescriptor(
  descriptor: Omit<
    AgentDescriptor,
    "descriptor_signature" | "descriptor_key_id" | "descriptor_signature_alg"
  >,
): Pick<
  AgentDescriptor,
  "descriptor_signature" | "descriptor_key_id" | "descriptor_signature_alg"
> {
  assertValidKeyUse("agent_descriptor", "descriptor");
  // Canonicalize the descriptor per RFC 8785 JCS before signing.
  const canonicalPayload = descriptorSigningPayload(descriptor);
  const signature = createCompactSignatureFromCanonical(
    canonicalPayload,
    undefined,
    "descriptor",
  );
  return {
    descriptor_signature: signature,
    descriptor_key_id: getSignatureKeyId(signature) ?? DEFAULT_KID,
    descriptor_signature_alg: getSignatureAlgorithm(signature) ?? DEFAULT_ALG,
  };
}

/**
 * Verifies an AgentDescriptor signature using RFC 8785 JCS canonicalization.
 *
 * The descriptor is canonicalized per RFC 8785 before verifying the
 * signature, matching the exact canonicalization performed during signing.
 */
export function verifyAgentDescriptorSignature(
  descriptor: AgentDescriptor,
): boolean {
  if (
    typeof descriptor.descriptor_signature !== "string" ||
    typeof descriptor.descriptor_key_id !== "string" ||
    typeof descriptor.descriptor_signature_alg !== "string"
  ) {
    return false;
  }

  const {
    descriptor_signature,
    descriptor_key_id: _descriptorKeyId,
    descriptor_signature_alg: _descriptorSignatureAlg,
    ...unsignedDescriptor
  } = descriptor;

  // Canonicalize the descriptor per RFC 8785 JCS before verifying.
  // This must match the exact canonicalization performed during signing.
  const canonicalPayload = descriptorSigningPayload(unsignedDescriptor);
  return verifyCompactSignatureFromCanonical(
    descriptor_signature,
    canonicalPayload,
    "descriptor",
  );
}

interface SignedRequestPayload {
  method: string;
  path: string;
  timestamp: string;
  key_id: string;
  body: string;
}

function signedRequestPayload(
  input: SignedRequestPayload,
): Record<string, unknown> {
  return {
    method: input.method.toUpperCase(),
    path: input.path,
    timestamp: input.timestamp,
    key_id: input.key_id,
    body: input.body,
  };
}

export function signHttpRequest(
  input: SignedRequestPayload,
): MapSignedRequestHeaders {
  assertValidKeyUse("http_request", "http_request");
  const signature = createCompactSignature(
    signedRequestPayload(input),
    input.key_id,
    "http_request",
  );
  const nonce = generateNonce();
  return {
    "x-map-auth-scheme": "signed_request",
    "x-map-key-id": input.key_id,
    "x-map-timestamp": input.timestamp,
    "x-map-request-signature": signature,
    "x-map-nonce": nonce,
  };
}

export function getVerificationKeys(): MapVerificationKey[] {
  return getSigningKeys().map((key) => {
    if (key.material.type === "rsa") {
      let jwk: Record<string, unknown> | undefined;
      try {
        jwk = createPublicKey(key.material.public_key_pem).export({
          format: "jwk",
        }) as Record<string, unknown>;
      } catch {
        jwk = undefined;
      }
      return {
        kid: key.kid,
        alg: key.alg,
        use: "sig",
        status: key.status,
        scopes: key.scopes,
        demo_only: key.demo_only,
        kty: "RSA" as const,
        public_key_pem: key.material.public_key_pem,
        ...(jwk ? { jwk } : {}),
      };
    }

    return {
      kid: key.kid,
      alg: key.alg,
      use: "sig",
      status: key.status,
      scopes: key.scopes,
      demo_only: key.demo_only,
      kty: "oct" as const,
    };
  });
}

export function getActiveSignatureKeyId(): string | null {
  try {
    return getActiveSigningKey().kid;
  } catch {
    return null;
  }
}

export function getSigningProviderStatus(): {
  provider: string;
  configured: boolean;
} {
  return getKeyProviderInfo();
}

export function verifyHttpRequestSignature(
  input: SignedRequestPayload & { signature: string; nonce?: string },
): boolean {
  const timestampMs = Date.parse(input.timestamp);
  if (Number.isNaN(timestampMs)) {
    return false;
  }

  const ageMs = Math.abs(Date.now() - timestampMs);
  if (ageMs > getRequestMaxAgeMs()) {
    return false;
  }

  if (input.nonce && !verifyNonce(input.nonce)) {
    return false;
  }

  return verifyCompactSignature(
    input.signature,
    signedRequestPayload(input),
    "http_request",
  );
}

interface AuditCheckpointPayload {
  checkpoint_id: string;
  created_at: string;
  last_chain_index: number;
  last_event_hash: string;
}

export function signAuditCheckpoint(payload: AuditCheckpointPayload): string {
  assertValidKeyUse("audit_checkpoint", "audit_checkpoint");
  return createCompactSignature(
    {
      checkpoint_id: payload.checkpoint_id,
      created_at: payload.created_at,
      last_chain_index: payload.last_chain_index,
      last_event_hash: payload.last_event_hash,
    },
    undefined,
    "audit_checkpoint",
  );
}

export function verifyAuditCheckpointSignature(
  payload: AuditCheckpointPayload,
  signature: string,
): boolean {
  return verifyCompactSignature(
    signature,
    {
      checkpoint_id: payload.checkpoint_id,
      created_at: payload.created_at,
      last_chain_index: payload.last_chain_index,
      last_event_hash: payload.last_event_hash,
    },
    "audit_checkpoint",
  );
}

interface AuditExportPayload {
  export_id: string;
  created_at: string;
  events_count: number;
  checkpoints_count: number;
  latest_chain_index: number;
  latest_event_hash: string;
}

export function signAuditExport(payload: AuditExportPayload): string {
  assertValidKeyUse("audit_export", "audit_export");
  return createCompactSignature(
    {
      export_id: payload.export_id,
      created_at: payload.created_at,
      events_count: payload.events_count,
      checkpoints_count: payload.checkpoints_count,
      latest_chain_index: payload.latest_chain_index,
      latest_event_hash: payload.latest_event_hash,
    },
    undefined,
    "audit_export",
  );
}

export function verifyAuditExportSignature(
  payload: AuditExportPayload,
  signature: string,
): boolean {
  return verifyCompactSignature(
    signature,
    {
      export_id: payload.export_id,
      created_at: payload.created_at,
      events_count: payload.events_count,
      checkpoints_count: payload.checkpoints_count,
      latest_chain_index: payload.latest_chain_index,
      latest_event_hash: payload.latest_event_hash,
    },
    "audit_export",
  );
}

interface ConformanceExportPayload {
  export_id: string;
  created_at: string;
  profile: "open" | "verified" | "regulated";
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  artifact_hash: string;
}

export function signConformanceExport(
  payload: ConformanceExportPayload,
): string {
  assertValidKeyUse("conformance_export", "conformance_export");
  return createCompactSignature(
    {
      export_id: payload.export_id,
      created_at: payload.created_at,
      profile: payload.profile,
      total_checks: payload.total_checks,
      passed_checks: payload.passed_checks,
      failed_checks: payload.failed_checks,
      artifact_hash: payload.artifact_hash,
    },
    undefined,
    "conformance_export",
  );
}

export function verifyConformanceExportSignature(
  payload: ConformanceExportPayload,
  signature: string,
): boolean {
  return verifyCompactSignature(
    signature,
    {
      export_id: payload.export_id,
      created_at: payload.created_at,
      profile: payload.profile,
      total_checks: payload.total_checks,
      passed_checks: payload.passed_checks,
      failed_checks: payload.failed_checks,
      artifact_hash: payload.artifact_hash,
    },
    "conformance_export",
  );
}

export function getTrustMetadata(
  profile: "open" | "verified" | "regulated",
): TrustMetadata {
  return {
    trust_domain: process.env.MAP_TRUST_DOMAIN ?? "map.local",
    issuer: process.env.MAP_SIGNING_ISSUER ?? "map.reference",
    profile,
  };
}

/**
 * Returns the configured trust anchors from the MAP_TRUST_ANCHORS
 * environment variable.  The variable must be a JSON array of
 * {@link TrustAnchor} objects.  Returns an empty array if the
 * variable is not set or cannot be parsed.
 */
export function getTrustAnchors(): TrustAnchor[] {
  const raw = process.env.MAP_TRUST_ANCHORS;
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("MAP_TRUST_ANCHORS is not a JSON array; ignoring.");
      return [];
    }
    return parsed as TrustAnchor[];
  } catch {
    console.warn("MAP_TRUST_ANCHORS contains invalid JSON; ignoring.");
    return [];
  }
}

/**
 * Checks whether a given trust domain is present in the configured
 * trust anchors.  If no trust anchors are configured, all domains
 * are considered trusted (open mode).
 */
export function verifyTrustDomain(domain: string): boolean {
  const anchors = getTrustAnchors();
  if (anchors.length === 0) {
    // No trust anchors configured — trust everything (open mode).
    return true;
  }
  return anchors.some((anchor) => anchor.trust_domain === domain);
}

/**
 * Checks whether a specific key (by its kid) is trusted for a given
 * trust domain.  Returns true if a trust anchor exists for the domain
 * and the anchor's public_keys include the requested kid.
 */
export function isKeyTrusted(keyId: string, domain: string): boolean {
  const anchors = getTrustAnchors();
  if (anchors.length === 0) {
    // No trust anchors configured — trust everything (open mode).
    return true;
  }
  const anchor = anchors.find((a) => a.trust_domain === domain);
  if (!anchor) {
    return false;
  }
  return anchor.public_keys.some((key) => key.kid === keyId);
}

interface TrustBundlePayload {
  bundle_id: string;
  created_at: string;
  trust_domain: string;
  issuer: string;
  profile: "open" | "verified" | "regulated";
  keys_hash: string;
}

export function signTrustBundle(payload: TrustBundlePayload): string {
  assertValidKeyUse("trust_bundle", "trust_bundle");
  return createCompactSignature(
    {
      bundle_id: payload.bundle_id,
      created_at: payload.created_at,
      trust_domain: payload.trust_domain,
      issuer: payload.issuer,
      profile: payload.profile,
      keys_hash: payload.keys_hash,
    },
    undefined,
    "trust_bundle",
  );
}

export function verifyTrustBundleSignature(
  payload: TrustBundlePayload,
  signature: string,
): boolean {
  return verifyCompactSignature(
    signature,
    {
      bundle_id: payload.bundle_id,
      created_at: payload.created_at,
      trust_domain: payload.trust_domain,
      issuer: payload.issuer,
      profile: payload.profile,
      keys_hash: payload.keys_hash,
    },
    "trust_bundle",
  );
}

/**
 * Returns a snapshot of the current signature metrics for observability.
 */
export function getSignatureMetrics(): {
  totalSignatures: number;
  failedVerifications: number;
  byKeyId: Map<string, { signed: number; verified: number; failed: number }>;
  byAlgorithm: Map<string, number>;
  lastSignature: string | null;
} {
  return {
    totalSignatures: signatureMetrics.totalSignatures,
    failedVerifications: signatureMetrics.failedVerifications,
    byKeyId: new Map(signatureMetrics.byKeyId),
    byAlgorithm: new Map(signatureMetrics.byAlgorithm),
    lastSignature: signatureMetrics.lastSignature,
  };
}

/**
 * Detects cryptographic anomalies including:
 * - High failure rate (>50% of recent verifications)
 * - Usage of revoked or retiring keys
 * - Unknown keys being used for signing
 */
export function detectAnomalies(): AnomalyReport[] {
  const reports: AnomalyReport[] = [];
  const now = new Date().toISOString();

  // Check for high failure rate
  const totalVerifications =
    signatureMetrics.totalSignatures + signatureMetrics.failedVerifications;
  if (totalVerifications > 0) {
    const failureRate =
      signatureMetrics.failedVerifications / totalVerifications;
    if (failureRate > 0.5) {
      reports.push({
        type: "high_failure_rate",
        severity: "critical",
        detail: `Signature verification failure rate is ${(failureRate * 100).toFixed(1)}% (${signatureMetrics.failedVerifications} failures out of ${totalVerifications} total verifications).`,
        detected_at: now,
        recommendation:
          "Investigate potential key misuse or an active attack. Rotate signing keys immediately and audit recent signature activity.",
      });
    }
  }

  // Check for usage of revoked or retiring keys
  const allKeys = getSigningKeys();
  const revokedKids = new Set(
    allKeys.filter((k) => k.status === "revoked").map((k) => k.kid),
  );
  const retiringKids = new Set(
    allKeys.filter((k) => k.status === "retiring").map((k) => k.kid),
  );

  for (const [kid, stats] of signatureMetrics.byKeyId) {
    if (revokedKids.has(kid) && stats.signed > 0) {
      reports.push({
        type: "revoked_key_usage",
        severity: "critical",
        detail: `Revoked key "${kid}" was used to sign ${stats.signed} payload(s).`,
        detected_at: now,
        recommendation: `Immediately investigate why revoked key "${kid}" is still being used. Revoke trust in this key and rotate to a new key.`,
      });
    }
    if (retiringKids.has(kid) && stats.signed > 0) {
      reports.push({
        type: "retiring_key_usage",
        severity: "warning",
        detail: `Retiring key "${kid}" was used to sign ${stats.signed} payload(s). Key should be phased out.`,
        detected_at: now,
        recommendation: `Accelerate migration away from retiring key "${kid}". Ensure all clients have the replacement key.`,
      });
    }

    // Check for unknown keys (keys in metrics but not in the key set)
    const knownKids = new Set(allKeys.map((k) => k.kid));
    if (!knownKids.has(kid) && stats.signed > 0) {
      reports.push({
        type: "unknown_key_usage",
        severity: "critical",
        detail: `Unknown key "${kid}" was used to sign ${stats.signed} payload(s). This key is not in the current key set.`,
        detected_at: now,
        recommendation: `Investigate the origin of unknown key "${kid}". This may indicate a compromised key or a configuration error.`,
      });
    }
  }

  return reports;
}

// ─────────────────────────────────────────────────────────────────────────────
// KMS Provider Integration (Step 23)
//
// The MAP KMS abstraction layer allows deployments to swap the signing
// backend without changing the rest of the codebase.  When a KMS provider
// is configured (via MAP_KMS_PROVIDER), callers can use the provider
// directly for sign/verify/rotate/revoke operations while the existing
// functions in this module continue to work for backward compatibility.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the currently resolved KMS provider instance.
 *
 * The provider is selected based on the MAP_KMS_PROVIDER environment
 * variable and cached after first resolution.  Use `resetKMSProvider()`
 * to force re-resolution (e.g., in tests).
 */
export function getActiveKMSProvider(): KMSProvider {
  return resolveKMSProvider();
}

/**
 * Resets the cached KMS provider so the next call to `getActiveKMSProvider()`
 * re-evaluates MAP_KMS_PROVIDER.  Useful for tests that change environment
 * variables between test cases.
 */
export { resetKMSProvider };
