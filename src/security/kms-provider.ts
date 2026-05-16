/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * KMS/HSM Abstraction Layer (Step 23)
 *
 * Pluggable key management service abstraction that allows MAP deployments
 * to integrate with various key management systems.
 *
 * ## Provider Selection
 *
 * Set the `MAP_KMS_PROVIDER` environment variable to one of:
 * - `local` (default) — wraps the existing signing.ts functions (dev)
 * - `env` — reads keys from `MAP_SIGNING_KEYS` environment variable
 * - `aws_kms` — placeholder for AWS KMS integration
 * - `hashicorp_vault` — placeholder for HashiCorp Vault integration
 *
 * ## Usage
 *
 * ```typescript
 * import { resolveKMSProvider } from "./kms-provider.js";
 *
 * const provider = resolveKMSProvider();
 * const sig = await provider.sign("my-key", payload, "HS256");
 * const valid = await provider.verify("my-key", payload, sig, "HS256");
 * ```
 */

import { createHmac, createSign, createVerify, createPrivateKey, createPublicKey, timingSafeEqual, randomBytes } from "node:crypto";
import type { MapVerificationKey } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// KMSProvider Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface KMSProvider {
  /** Unique identifier for this provider instance. */
  readonly id: string;

  /**
   * Signs a payload with the specified key and algorithm.
   *
   * @param keyId - The key identifier to use for signing.
   * @param payload - The raw payload bytes to sign.
   * @param algorithm - The signing algorithm (HS256 or RS256).
   * @returns The raw signature bytes (not base64-encoded).
   */
  sign(keyId: string, payload: Buffer, algorithm: "HS256" | "RS256"): Promise<Buffer>;

  /**
   * Verifies a signature against a payload.
   *
   * @param keyId - The key identifier that was used for signing.
   * @param payload - The raw payload bytes that were signed.
   * @param signature - The raw signature bytes to verify.
   * @param algorithm - The signing algorithm (HS256 or RS256).
   * @returns True if the signature is valid.
   */
  verify(keyId: string, payload: Buffer, signature: Buffer, algorithm: "HS256" | "RS256"): Promise<boolean>;

  /**
   * Lists all verification keys known to this provider.
   */
  listKeys(): Promise<MapVerificationKey[]>;

  /**
   * Rotates the specified key, returning the new key's verification metadata.
   * The old key transitions to "retiring" status.
   *
   * @param keyId - The key identifier to rotate.
   * @returns The new key's verification metadata.
   */
  rotateKey(keyId: string): Promise<MapVerificationKey>;

  /**
   * Revokes the specified key immediately.
   *
   * @param keyId - The key identifier to revoke.
   * @param reason - A human-readable reason for revocation (audit trail).
   */
  revokeKey(keyId: string, reason: string): Promise<void>;

  /**
   * Returns the current status of the specified key.
   *
   * @param keyId - The key identifier to query.
   * @returns The key's status: "active", "retiring", or "revoked".
   */
  getKeyStatus(keyId: string): Promise<"active" | "retiring" | "revoked">;
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Material Types
// ─────────────────────────────────────────────────────────────────────────────

interface KeyMaterial {
  kid: string;
  alg: "HS256" | "RS256";
  status: "active" | "retiring" | "revoked";
  scopes: string[];
  demo_only: boolean;
  material:
    | { type: "hmac"; secret: string }
    | { type: "rsa"; private_key_pem?: string; public_key_pem: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// LocalKMSProvider
//
// Wraps the existing signing.ts key management for development and testing.
// Uses in-memory key material loaded from the existing signing infrastructure.
// ─────────────────────────────────────────────────────────────────────────────

export class LocalKMSProvider implements KMSProvider {
  readonly id = "local";

  private keys: Map<string, KeyMaterial>;
  private loadKeys: () => KeyMaterial[];

  constructor(loadKeys: () => KeyMaterial[]) {
    this.loadKeys = loadKeys;
    this.keys = new Map();
    this.refreshKeys();
  }

  private refreshKeys(): void {
    this.keys.clear();
    for (const key of this.loadKeys()) {
      this.keys.set(key.kid, key);
    }
  }

  async sign(
    keyId: string,
    payload: Buffer,
    algorithm: "HS256" | "RS256",
  ): Promise<Buffer> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`LocalKMSProvider: key not found: ${keyId}`);
    }
    if (key.status === "revoked") {
      throw new Error(`LocalKMSProvider: key is revoked: ${keyId}`);
    }
    if (key.alg !== algorithm) {
      throw new Error(
        `LocalKMSProvider: algorithm mismatch: requested ${algorithm}, key has ${key.alg}`,
      );
    }

    if (key.material.type === "hmac") {
      return createHmac("sha256", key.material.secret)
        .update(payload)
        .digest();
    }

    if (!key.material.private_key_pem) {
      throw new Error(
        `LocalKMSProvider: no private key configured for RS256 key: ${keyId}`,
      );
    }

    const signer = createSign("RSA-SHA256");
    signer.update(payload);
    signer.end();
    return signer.sign(createPrivateKey(key.material.private_key_pem));
  }

  async verify(
    keyId: string,
    payload: Buffer,
    signature: Buffer,
    algorithm: "HS256" | "RS256",
  ): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key) {
      return false;
    }
    if (key.status === "revoked") {
      return false;
    }
    if (key.alg !== algorithm) {
      return false;
    }

    if (key.material.type === "hmac") {
      const expected = createHmac("sha256", key.material.secret)
        .update(payload)
        .digest();
      try {
        return timingSafeEqual(signature, expected);
      } catch {
        // Length mismatch — compare dummy for constant-time safety
        try {
          timingSafeEqual(expected, expected);
        } catch { /* never throws */ }
        return false;
      }
    }

    try {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(payload);
      verifier.end();
      return verifier.verify(
        createPublicKey(key.material.public_key_pem),
        signature,
      );
    } catch {
      return false;
    }
  }

  async listKeys(): Promise<MapVerificationKey[]> {
    this.refreshKeys();
    const result: MapVerificationKey[] = [];
    for (const key of this.keys.values()) {
      if (key.material.type === "rsa") {
        let jwk: Record<string, unknown> | undefined;
        try {
          jwk = createPublicKey(key.material.public_key_pem).export({
            format: "jwk",
          }) as Record<string, unknown>;
        } catch {
          jwk = undefined;
        }
        result.push({
          kid: key.kid,
          alg: key.alg,
          use: "sig",
          status: key.status,
          scopes: key.scopes,
          demo_only: key.demo_only,
          kty: "RSA",
          public_key_pem: key.material.public_key_pem,
          ...(jwk ? { jwk } : {}),
        });
      } else {
        result.push({
          kid: key.kid,
          alg: key.alg,
          use: "sig",
          status: key.status,
          scopes: key.scopes,
          demo_only: key.demo_only,
          kty: "oct",
        });
      }
    }
    return result;
  }

  async rotateKey(keyId: string): Promise<MapVerificationKey> {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) {
      throw new Error(`LocalKMSProvider: cannot rotate unknown key: ${keyId}`);
    }

    // Mark old key as retiring
    oldKey.status = "retiring";
    this.keys.set(keyId, oldKey);

    // Generate a new key with a fresh kid
    const newKid = `${keyId}-rotated-${Date.now()}`;
    let newKey: KeyMaterial;

    if (oldKey.material.type === "hmac") {
      // Generate a fresh HMAC secret
      const newSecret = randomBytes(32).toString("base64url");
      newKey = {
        kid: newKid,
        alg: "HS256",
        status: "active",
        scopes: [...oldKey.scopes],
        demo_only: oldKey.demo_only,
        material: { type: "hmac", secret: newSecret },
      };
    } else {
      // For RSA, keep the same key pair but with a new kid
      newKey = {
        kid: newKid,
        alg: "RS256",
        status: "active",
        scopes: [...oldKey.scopes],
        demo_only: oldKey.demo_only,
        material: {
          type: "rsa",
          public_key_pem: oldKey.material.public_key_pem,
          private_key_pem: oldKey.material.private_key_pem,
        },
      };
    }

    this.keys.set(newKid, newKey);

    return {
      kid: newKid,
      alg: newKey.alg,
      use: "sig",
      status: newKey.status,
      scopes: newKey.scopes,
      demo_only: newKey.demo_only,
      kty: newKey.material.type === "rsa" ? "RSA" : "oct",
      ...(newKey.material.type === "rsa"
        ? { public_key_pem: newKey.material.public_key_pem }
        : {}),
    };
  }

  async revokeKey(keyId: string, reason: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`LocalKMSProvider: cannot revoke unknown key: ${keyId}`);
    }
    key.status = "revoked";
    this.keys.set(keyId, key);
    console.warn(
      `LocalKMSProvider: key ${keyId} revoked. Reason: ${reason}`,
    );
  }

  async getKeyStatus(keyId: string): Promise<"active" | "retiring" | "revoked"> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`LocalKMSProvider: key not found: ${keyId}`);
    }
    return key.status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EnvKMSProvider
//
// Reads keys from the `MAP_SIGNING_KEYS` environment variable (JSON array).
// This is the current default behavior, now wrapped in a KMSProvider interface.
// ─────────────────────────────────────────────────────────────────────────────

export class EnvKMSProvider implements KMSProvider {
  readonly id = "env";

  private getKeys(): KeyMaterial[] {
    const raw = process.env.MAP_SIGNING_KEYS;
    if (!raw || raw.trim().length === 0) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (key: Record<string, unknown>) =>
            key && typeof key.kid === "string" && key.kid.trim().length > 0,
        )
        .map((key: Record<string, unknown>): KeyMaterial | null => {
          const alg: "HS256" | "RS256" = key.alg === "RS256" ? "RS256" : "HS256";
          const status: "active" | "retiring" | "revoked" =
            key.status === "revoked"
              ? "revoked"
              : key.status === "retiring"
                ? "retiring"
                : "active";
          const base = {
            kid: (key.kid as string).trim(),
            alg,
            status,
            scopes:
              Array.isArray(key.scopes) && key.scopes.length > 0
                ? (key.scopes as string[])
                : [
                    "descriptor",
                    "delegation_token",
                    "receipt",
                    "http_request",
                    "audit_checkpoint",
                    "audit_export",
                    "conformance_export",
                    "trust_bundle",
                  ],
            demo_only: (key.demo_only as boolean) ?? false,
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
                public_key_pem: key.public_key_pem as string,
                private_key_pem:
                  typeof key.private_key_pem === "string" &&
                  key.private_key_pem.trim().length > 0
                    ? (key.private_key_pem as string)
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
              secret: key.secret as string,
            },
          };
        })
        .filter((key): key is KeyMaterial => Boolean(key));
    } catch {
      return [];
    }
  }

  async sign(
    keyId: string,
    payload: Buffer,
    algorithm: "HS256" | "RS256",
  ): Promise<Buffer> {
    const keys = this.getKeys();
    const key = keys.find((k) => k.kid === keyId);
    if (!key) {
      throw new Error(`EnvKMSProvider: key not found: ${keyId}`);
    }
    if (key.status === "revoked") {
      throw new Error(`EnvKMSProvider: key is revoked: ${keyId}`);
    }
    if (key.alg !== algorithm) {
      throw new Error(
        `EnvKMSProvider: algorithm mismatch: requested ${algorithm}, key has ${key.alg}`,
      );
    }

    if (key.material.type === "hmac") {
      return createHmac("sha256", key.material.secret)
        .update(payload)
        .digest();
    }

    if (!key.material.private_key_pem) {
      throw new Error(
        `EnvKMSProvider: no private key configured for RS256 key: ${keyId}`,
      );
    }

    const signer = createSign("RSA-SHA256");
    signer.update(payload);
    signer.end();
    return signer.sign(createPrivateKey(key.material.private_key_pem));
  }

  async verify(
    keyId: string,
    payload: Buffer,
    signature: Buffer,
    algorithm: "HS256" | "RS256",
  ): Promise<boolean> {
    const keys = this.getKeys();
    const key = keys.find((k) => k.kid === keyId);
    if (!key || key.status === "revoked" || key.alg !== algorithm) {
      return false;
    }

    if (key.material.type === "hmac") {
      const expected = createHmac("sha256", key.material.secret)
        .update(payload)
        .digest();
      try {
        return timingSafeEqual(signature, expected);
      } catch {
        try {
          timingSafeEqual(expected, expected);
        } catch { /* never throws */ }
        return false;
      }
    }

    try {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(payload);
      verifier.end();
      return verifier.verify(
        createPublicKey(key.material.public_key_pem),
        signature,
      );
    } catch {
      return false;
    }
  }

  async listKeys(): Promise<MapVerificationKey[]> {
    return this.getKeys().map((key) => {
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
          use: "sig" as const,
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
        use: "sig" as const,
        status: key.status,
        scopes: key.scopes,
        demo_only: key.demo_only,
        kty: "oct" as const,
      };
    });
  }

  async rotateKey(_keyId: string): Promise<MapVerificationKey> {
    throw new Error(
      "EnvKMSProvider: key rotation is not supported for env-based keys. " +
        "Update MAP_SIGNING_KEYS environment variable and restart the server.",
    );
  }

  async revokeKey(_keyId: string, _reason: string): Promise<void> {
    throw new Error(
      "EnvKMSProvider: key revocation is not supported for env-based keys. " +
        "Use MAP_SIGNING_REVOKED_KIDS to mark keys as revoked via environment configuration.",
    );
  }

  async getKeyStatus(keyId: string): Promise<"active" | "retiring" | "revoked"> {
    const keys = this.getKeys();
    const key = keys.find((k) => k.kid === keyId);
    if (!key) {
      throw new Error(`EnvKMSProvider: key not found: ${keyId}`);
    }
    return key.status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AwsKMSProvider (Stub)
//
// Placeholder for AWS KMS integration. To implement:
//
// 1. Install the AWS SDK:  npm install @aws-sdk/client-kms
// 2. Configure AWS credentials via environment variables or IAM roles.
// 3. Set MAP_KMS_PROVIDER=aws_kms and MAP_AWS_KMS_KEY_ARN=...
// 4. Implement the sign/verify/listKeys/rotateKey/revokeKey methods
//    using the AWS KMS API.
//
// The AWS KMS API uses key ARNs, not simple key IDs. Map your MAP key IDs
// to AWS KMS key ARNs via the MAP_AWS_KMS_KEY_MAP environment variable
// (a JSON object mapping kid → key ARN).
// ─────────────────────────────────────────────────────────────────────────────

export class AwsKMSProvider implements KMSProvider {
  readonly id = "aws_kms";

  private get notImplementedError(): Error {
    return new Error(
      "AwsKMSProvider: not yet implemented. Install @aws-sdk/client-kms and " +
        "configure MAP_AWS_KMS_KEY_ARN to enable AWS KMS integration. " +
        "See src/security/kms-provider.ts for implementation instructions.",
    );
  }

  async sign(
    _keyId: string,
    _payload: Buffer,
    _algorithm: "HS256" | "RS256",
  ): Promise<Buffer> {
    throw this.notImplementedError;
  }

  async verify(
    _keyId: string,
    _payload: Buffer,
    _signature: Buffer,
    _algorithm: "HS256" | "RS256",
  ): Promise<boolean> {
    throw this.notImplementedError;
  }

  async listKeys(): Promise<MapVerificationKey[]> {
    throw this.notImplementedError;
  }

  async rotateKey(_keyId: string): Promise<MapVerificationKey> {
    throw this.notImplementedError;
  }

  async revokeKey(_keyId: string, _reason: string): Promise<void> {
    throw this.notImplementedError;
  }

  async getKeyStatus(_keyId: string): Promise<"active" | "retiring" | "revoked"> {
    throw this.notImplementedError;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HashiCorpVaultProvider (Stub)
//
// Placeholder for HashiCorp Vault integration. To implement:
//
// 1. Install the Vault client:  npm install node-vault
// 2. Configure Vault connection via MAP_VAULT_ADDR and MAP_VAULT_TOKEN.
// 3. Set MAP_KMS_PROVIDER=hashicorp_vault
// 4. Implement the sign/verify/listKeys/rotateKey/revokeKey methods
//    using the Vault Transit secrets engine.
//
// The Vault Transit engine supports both HMAC and RSA operations.
// Map your MAP key IDs to Vault key names in the transit backend.
// ─────────────────────────────────────────────────────────────────────────────

export class HashiCorpVaultProvider implements KMSProvider {
  readonly id = "hashicorp_vault";

  private get notImplementedError(): Error {
    return new Error(
      "HashiCorpVaultProvider: not yet implemented. Install node-vault and " +
        "configure MAP_VAULT_ADDR and MAP_VAULT_TOKEN to enable HashiCorp Vault integration. " +
        "See src/security/kms-provider.ts for implementation instructions.",
    );
  }

  async sign(
    _keyId: string,
    _payload: Buffer,
    _algorithm: "HS256" | "RS256",
  ): Promise<Buffer> {
    throw this.notImplementedError;
  }

  async verify(
    _keyId: string,
    _payload: Buffer,
    _signature: Buffer,
    _algorithm: "HS256" | "RS256",
  ): Promise<boolean> {
    throw this.notImplementedError;
  }

  async listKeys(): Promise<MapVerificationKey[]> {
    throw this.notImplementedError;
  }

  async rotateKey(_keyId: string): Promise<MapVerificationKey> {
    throw this.notImplementedError;
  }

  async revokeKey(_keyId: string, _reason: string): Promise<void> {
    throw this.notImplementedError;
  }

  async getKeyStatus(_keyId: string): Promise<"active" | "retiring" | "revoked"> {
    throw this.notImplementedError;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Resolution
// ─────────────────────────────────────────────────────────────────────────────

let _cachedProvider: KMSProvider | null = null;

/**
 * Resolves the KMS provider based on the MAP_KMS_PROVIDER environment variable.
 *
 * Supported values:
 * - `local` (default) — LocalKMSProvider wrapping existing signing infrastructure
 * - `env` — EnvKMSProvider reading from MAP_SIGNING_KEYS
 * - `aws_kms` — AwsKMSProvider stub (not yet implemented)
 * - `hashicorp_vault` — HashiCorpVaultProvider stub (not yet implemented)
 *
 * The provider is cached after first resolution. To force re-resolution,
 * pass `forceRefresh = true`.
 */
export function resolveKMSProvider(
  forceRefresh = false,
): KMSProvider {
  if (_cachedProvider && !forceRefresh) {
    return _cachedProvider;
  }

  const configured = (process.env.MAP_KMS_PROVIDER ?? "local").trim().toLowerCase();

  switch (configured) {
    case "aws_kms":
    case "aws":
      _cachedProvider = new AwsKMSProvider();
      break;
    case "hashicorp_vault":
    case "vault":
      _cachedProvider = new HashiCorpVaultProvider();
      break;
    case "env":
      _cachedProvider = new EnvKMSProvider();
      break;
    case "local":
    default: {
      // LocalKMSProvider needs access to the key loading function.
      // We import from signing.ts lazily to avoid circular dependency.
      // The signing module will set the key loader after both modules are loaded.
      _cachedProvider = new LocalKMSProvider(getDefaultKeyLoader());
      break;
    }
  }

  console.info(`MAP KMS provider resolved: ${_cachedProvider.id}`);
  return _cachedProvider;
}

/**
 * Resets the cached KMS provider. Useful for testing.
 */
export function resetKMSProvider(): void {
  _cachedProvider = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Loader Bridge
//
// The LocalKMSProvider needs access to the signing keys managed by signing.ts.
// To avoid circular imports, we use a lazy-load pattern. The signing module
// calls `setKMSKeyLoader()` during initialization.
// ─────────────────────────────────────────────────────────────────────────────

let _keyLoader: (() => KeyMaterial[]) | null = null;

function getDefaultKeyLoader(): () => KeyMaterial[] {
  if (_keyLoader) {
    return _keyLoader;
  }
  // Fallback: return an empty key set if the loader hasn't been set yet.
  console.warn(
    "KMS key loader not configured. Signing operations will fail until signing.ts initializes the loader.",
  );
  return () => [];
}

/**
 * Sets the key loader function used by LocalKMSProvider.
 * Called by signing.ts to bridge the KMS provider with the signing key infrastructure.
 */
export function setKMSKeyLoader(loader: () => KeyMaterial[]): void {
  _keyLoader = loader;
}
