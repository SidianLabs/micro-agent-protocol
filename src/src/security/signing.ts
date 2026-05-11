import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  timingSafeEqual
} from "node:crypto";
import type {
  AgentDescriptor,
  DelegationToken,
  ExecutionReceipt,
  MapSignedRequestHeaders
} from "../types.js";
import {
  getKeyProviderInfo,
  getSigningKeyConfigsFromProvider
} from "./key-provider.js";

const DEFAULT_KID = "map-dev-key-1";
const DEFAULT_ALG = "HS256";
const DEFAULT_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
const nonceCache = new Map<string, number>();
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;

const DEFAULT_SCOPES = [
  "descriptor",
  "delegation_token",
  "receipt",
  "http_request",
  "audit_checkpoint",
  "audit_export",
  "conformance_export",
  "trust_bundle"
];

function getDeploymentProfile(): "open" | "verified" | "regulated" {
  const profile = process.env.MAP_DEPLOYMENT_PROFILE;
  if (profile === "verified" || profile === "regulated") {
    return profile;
  }
  return "open";
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

export interface MapVerificationKey {
  kid: string;
  alg: "HS256" | "RS256";
  use: "sig";
  status: "active" | "retiring" | "revoked";
  scopes: string[];
  demo_only: boolean;
  kty?: "oct" | "RSA";
  public_key_pem?: string;
  jwk?: Record<string, unknown>;
}

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
      .filter((value) => value.length > 0)
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
        secret
      }
    };
  }

  const profile = getDeploymentProfile();
  if (profile !== "open") {
    throw new Error(
      "MAP_SIGNING_SECRET must be configured for verified/regulated profiles."
    );
  }

  console.warn(
    "WARNING: Using default demo signing secret. Not suitable for production."
  );
  return {
    kid: DEFAULT_KID,
    alg: "HS256",
    status: "active",
    scopes: DEFAULT_SCOPES,
    demo_only: true,
    material: {
      type: "hmac",
      secret: "map-dev-secret"
    }
  };
}

function getSigningKeys(): SigningKey[] {
  const revokedKids = getRevokedKidsFromEnv();
  const providerKeys = getSigningKeyConfigsFromProvider();
  if (providerKeys.length === 0) {
    const key = getDefaultSigningKey();
    if (revokedKids.has(key.kid)) {
      return [{ ...key, status: "revoked" }];
    }
    return [key];
  }

  try {
    const keys = providerKeys
      .filter(
        (key) => key && typeof key.kid === "string" && key.kid.trim().length > 0
      )
      .map((key): SigningKey | null => {
        const alg: SigningKey["alg"] = key.alg === "RS256" ? "RS256" : "HS256";
        const status: SigningKey["status"] =
          key.status === "revoked" ? "revoked" : key.status === "retiring" ? "retiring" : "active";
        const base = {
          kid: key.kid.trim(),
          alg,
          status,
          scopes: Array.isArray(key.scopes) && key.scopes.length > 0 ? key.scopes : DEFAULT_SCOPES,
          demo_only: key.demo_only ?? false
        };

        if (alg === "RS256") {
          if (typeof key.public_key_pem !== "string" || key.public_key_pem.trim().length === 0) {
            return null;
          }
          return {
            ...base,
            material: {
              type: "rsa",
              public_key_pem: key.public_key_pem,
              private_key_pem:
                typeof key.private_key_pem === "string" && key.private_key_pem.trim().length > 0
                  ? key.private_key_pem
                  : undefined
            }
          };
        }

        if (typeof key.secret !== "string" || key.secret.length === 0) {
          return null;
        }
        return {
          ...base,
          material: {
            type: "hmac",
            secret: key.secret
          }
        };
      })
      .filter((key): key is SigningKey => Boolean(key));

    const normalized =
      keys.length > 0 ? keys : [getDefaultSigningKey()];
    return normalized.map((key) =>
      revokedKids.has(key.kid) ? { ...key, status: "revoked" } : key
    );
  } catch {
    const key = getDefaultSigningKey();
    if (revokedKids.has(key.kid)) {
      return [{ ...key, status: "revoked" }];
    }
    return [key];
  }
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
  const value = Number(process.env.MAP_REQUEST_MAX_AGE_MS ?? DEFAULT_REQUEST_MAX_AGE_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_REQUEST_MAX_AGE_MS;
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function createCompactSignature(
  payload: Record<string, unknown>,
  requestedKid?: string,
  scope?: SignatureScope
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
    throw new Error(`Signing key ${signingKey.kid} is not authorized for scope ${scope}.`);
  }

  const header: SigningHeader = {
    alg: signingKey.alg,
    kid: signingKey.kid,
    typ: "MAPSIG"
  };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(stableStringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature =
    signingKey.material.type === "hmac"
      ? createHmac("sha256", signingKey.material.secret).update(signingInput).digest("base64url")
      : (() => {
          if (!signingKey.material.private_key_pem) {
            throw new Error(`No private key configured for signing kid: ${signingKey.kid}`);
          }
          const signer = createSign("RSA-SHA256");
          signer.update(signingInput);
          signer.end();
          return signer.sign(createPrivateKey(signingKey.material.private_key_pem)).toString("base64url");
        })();
  return `${signingInput}.${signature}`;
}

function verifyCompactSignature(
  signature: string,
  payload: Record<string, unknown>,
  scope?: SignatureScope
): boolean {
  const parts = signature.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  let parsedHeader: SigningHeader | undefined;
  try {
    parsedHeader = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as SigningHeader;
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
  if (!signingKey || signingKey.status === "revoked" || signingKey.alg !== parsedHeader.alg) {
    return false;
  }
  if (scope && !signingKey.scopes.includes(scope)) {
    return false;
  }

  const expectedPayload = base64url(stableStringify(payload));
  if (encodedPayload !== expectedPayload) {
    return false;
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  if (signingKey.material.type === "hmac") {
    const expectedSignature = createHmac("sha256", signingKey.material.secret)
      .update(signingInput)
      .digest("base64url");

    try {
      return timingSafeEqual(
        Buffer.from(providedSignature, "base64url"),
        Buffer.from(expectedSignature, "base64url")
      );
    } catch {
      // timingSafeEqual throws on length mismatch.
      // Perform a dummy constant-time comparison to avoid leaking length.
      const dummy = Buffer.from(expectedSignature, "base64url");
      try { timingSafeEqual(dummy, dummy); } catch { /* never throws for equal-length */ }
      return false;
    }
  }

  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signingInput);
    verifier.end();
    return verifier.verify(
      createPublicKey(signingKey.material.public_key_pem),
      Buffer.from(providedSignature, "base64url")
    );
  } catch {
    return false;
  }
}

export function getSignatureKeyId(signature: string): string | null {
  const parts = signature.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const parsedHeader = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
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
      Buffer.from(parts[0], "base64url").toString("utf8")
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

function tokenSigningPayload(token: Omit<DelegationToken, "signature">): Record<string, unknown> {
  return {
    issuer: token.issuer,
    subject_agent: token.subject_agent,
    allowed_actions: token.allowed_actions,
    resource_scope: token.resource_scope,
    constraints: token.constraints,
    approval_reference: token.approval_reference ?? null,
    requester_identity: token.requester_identity ?? null
  };
}

function descriptorSigningPayload(
  descriptor: Omit<
    AgentDescriptor,
    "descriptor_signature" | "descriptor_key_id" | "descriptor_signature_alg"
  >
): Record<string, unknown> {
  return {
    ...descriptor
  };
}

function receiptSigningPayload(
  receipt: Omit<ExecutionReceipt, "signature">
): Record<string, unknown> {
  return {
    receipt_id: receipt.receipt_id,
    task_id: receipt.task_id,
    tenant_id: receipt.tenant_id ?? null,
    request_id: receipt.request_id ?? null,
    agent_id: receipt.agent_id,
    action_taken: receipt.action_taken,
    resource_touched: receipt.resource_touched,
    policy_checks: receipt.policy_checks,
    approval_used: receipt.approval_used ?? null,
    timestamp: receipt.timestamp,
    result_hash: receipt.result_hash,
    requested_schema_version: receipt.requested_schema_version ?? null,
    executed_schema_version: receipt.executed_schema_version ?? null,
    negotiation: receipt.negotiation ?? null
  };
}

export function signDelegationToken(token: Omit<DelegationToken, "signature">): string {
  return createCompactSignature(tokenSigningPayload(token), undefined, "delegation_token");
}

export function verifyDelegationTokenSignature(token: DelegationToken): boolean {
  const { signature, ...unsignedToken } = token;
  return verifyCompactSignature(signature, tokenSigningPayload(unsignedToken), "delegation_token");
}

export function signReceipt(receipt: Omit<ExecutionReceipt, "signature">): string {
  return createCompactSignature(receiptSigningPayload(receipt), undefined, "receipt");
}

export function signAgentDescriptor(
  descriptor: Omit<
    AgentDescriptor,
    "descriptor_signature" | "descriptor_key_id" | "descriptor_signature_alg"
  >
): Pick<AgentDescriptor, "descriptor_signature" | "descriptor_key_id" | "descriptor_signature_alg"> {
  const signature = createCompactSignature(descriptorSigningPayload(descriptor), undefined, "descriptor");
  return {
    descriptor_signature: signature,
    descriptor_key_id: getSignatureKeyId(signature) ?? DEFAULT_KID,
    descriptor_signature_alg: getSignatureAlgorithm(signature) ?? DEFAULT_ALG
  };
}

export function verifyAgentDescriptorSignature(descriptor: AgentDescriptor): boolean {
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

  return verifyCompactSignature(
    descriptor_signature,
    descriptorSigningPayload(unsignedDescriptor),
    "descriptor"
  );
}

interface SignedRequestPayload {
  method: string;
  path: string;
  timestamp: string;
  key_id: string;
  body: string;
}

function signedRequestPayload(input: SignedRequestPayload): Record<string, unknown> {
  return {
    method: input.method.toUpperCase(),
    path: input.path,
    timestamp: input.timestamp,
    key_id: input.key_id,
    body: input.body
  };
}

export function signHttpRequest(input: SignedRequestPayload): MapSignedRequestHeaders {
  const signature = createCompactSignature(signedRequestPayload(input), input.key_id, "http_request");
  const nonce = generateNonce();
  return {
    "x-map-auth-scheme": "signed_request",
    "x-map-key-id": input.key_id,
    "x-map-timestamp": input.timestamp,
    "x-map-request-signature": signature,
    "x-map-nonce": nonce
  };
}

export function getVerificationKeys(): MapVerificationKey[] {
  return getSigningKeys().map((key) => {
    if (key.material.type === "rsa") {
      let jwk: Record<string, unknown> | undefined;
      try {
        jwk = createPublicKey(key.material.public_key_pem).export({
          format: "jwk"
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
        ...(jwk ? { jwk } : {})
      };
    }

    return {
      kid: key.kid,
      alg: key.alg,
      use: "sig",
      status: key.status,
      scopes: key.scopes,
      demo_only: key.demo_only,
      kty: "oct" as const
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

export function getSigningProviderStatus(): { provider: string; configured: boolean } {
  return getKeyProviderInfo();
}

export function verifyHttpRequestSignature(input: SignedRequestPayload & { signature: string; nonce?: string }): boolean {
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

  return verifyCompactSignature(input.signature, signedRequestPayload(input), "http_request");
}

interface AuditCheckpointPayload {
  checkpoint_id: string;
  created_at: string;
  last_chain_index: number;
  last_event_hash: string;
}

export function signAuditCheckpoint(payload: AuditCheckpointPayload): string {
  return createCompactSignature({
    checkpoint_id: payload.checkpoint_id,
    created_at: payload.created_at,
    last_chain_index: payload.last_chain_index,
    last_event_hash: payload.last_event_hash
  }, undefined, "audit_checkpoint");
}

export function verifyAuditCheckpointSignature(
  payload: AuditCheckpointPayload,
  signature: string
): boolean {
  return verifyCompactSignature(signature, {
    checkpoint_id: payload.checkpoint_id,
    created_at: payload.created_at,
    last_chain_index: payload.last_chain_index,
    last_event_hash: payload.last_event_hash
  }, "audit_checkpoint");
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
  return createCompactSignature({
    export_id: payload.export_id,
    created_at: payload.created_at,
    events_count: payload.events_count,
    checkpoints_count: payload.checkpoints_count,
    latest_chain_index: payload.latest_chain_index,
    latest_event_hash: payload.latest_event_hash
  }, undefined, "audit_export");
}

export function verifyAuditExportSignature(
  payload: AuditExportPayload,
  signature: string
): boolean {
  return verifyCompactSignature(signature, {
    export_id: payload.export_id,
    created_at: payload.created_at,
    events_count: payload.events_count,
    checkpoints_count: payload.checkpoints_count,
    latest_chain_index: payload.latest_chain_index,
    latest_event_hash: payload.latest_event_hash
  }, "audit_export");
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

export function signConformanceExport(payload: ConformanceExportPayload): string {
  return createCompactSignature({
    export_id: payload.export_id,
    created_at: payload.created_at,
    profile: payload.profile,
    total_checks: payload.total_checks,
    passed_checks: payload.passed_checks,
    failed_checks: payload.failed_checks,
    artifact_hash: payload.artifact_hash
  }, undefined, "conformance_export");
}

export function verifyConformanceExportSignature(
  payload: ConformanceExportPayload,
  signature: string
): boolean {
  return verifyCompactSignature(signature, {
    export_id: payload.export_id,
    created_at: payload.created_at,
    profile: payload.profile,
    total_checks: payload.total_checks,
    passed_checks: payload.passed_checks,
    failed_checks: payload.failed_checks,
    artifact_hash: payload.artifact_hash
  }, "conformance_export");
}

export function getTrustMetadata(profile: "open" | "verified" | "regulated"): TrustMetadata {
  return {
    trust_domain: process.env.MAP_TRUST_DOMAIN ?? "map.local",
    issuer: process.env.MAP_SIGNING_ISSUER ?? "map.reference",
    profile
  };
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
  return createCompactSignature(
    {
      bundle_id: payload.bundle_id,
      created_at: payload.created_at,
      trust_domain: payload.trust_domain,
      issuer: payload.issuer,
      profile: payload.profile,
      keys_hash: payload.keys_hash
    },
    undefined,
    "trust_bundle"
  );
}

export function verifyTrustBundleSignature(payload: TrustBundlePayload, signature: string): boolean {
  return verifyCompactSignature(
    signature,
    {
      bundle_id: payload.bundle_id,
      created_at: payload.created_at,
      trust_domain: payload.trust_domain,
      issuer: payload.issuer,
      profile: payload.profile,
      keys_hash: payload.keys_hash
    },
    "trust_bundle"
  );
}
