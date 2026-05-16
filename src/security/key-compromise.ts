/**
 * Emergency Key Compromise Workflow (Step 24)
 *
 * Provides an emergency mechanism for revoking ALL signing keys in response
 * to a suspected or confirmed key compromise.  This workflow:
 *
 * 1. Immediately revokes every active and retiring key.
 * 2. Logs a critical audit event for forensic traceability.
 * 3. Optionally generates emergency replacement keys if MAP_EMERGENCY_KEY
 *    is set in the environment.
 *
 * ## Usage
 *
 * ```typescript
 * import { emergencyRevokeAllKeys, verifyCompromiseStatus } from "./key-compromise.js";
 *
 * // Check current compromise status
 * const status = verifyCompromiseStatus();
 * if (!status.compromised) {
 *   // Trigger emergency revocation
 *   const newKey = await emergencyRevokeAllKeys("Suspected key exfiltration");
 *   console.log("Emergency key:", newKey.kid);
 * }
 * ```
 */

import { generateKeyPairSync } from "node:crypto";
import {
  getActiveKMSProvider,
  resetKMSProvider,
} from "./signing.js";

// ─────────────────────────────────────────────────────────────────────────────
// Compromise State
// ─────────────────────────────────────────────────────────────────────────────

interface CompromiseRecord {
  compromised: boolean;
  revoked_at: string;
  reason: string;
  emergency_key_id?: string;
  revoked_key_ids: string[];
}

let _compromiseRecord: CompromiseRecord | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Key Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a new emergency signing key.
 *
 * If `MAP_EMERGENCY_KEY` is set in the environment, its value is used
 * as an HMAC secret (HS256).  Otherwise, a fresh RSA key pair is
 * generated (RS256).
 *
 * @returns An object with the new key's ID and either a secret (HS256)
 *          or a public_key_pem (RS256).  The secret is only returned
 *          once — the caller MUST store it securely.
 */
export async function generateEmergencyKey(): Promise<{
  kid: string;
  secret?: string;
  public_key_pem?: string;
}> {
  const envKey = process.env.MAP_EMERGENCY_KEY;
  if (envKey && envKey.trim().length > 0) {
    // HMAC-based emergency key from environment
    const kid = `emergency-${Date.now()}`;
    return {
      kid,
      secret: envKey.trim(),
    };
  }

  // Generate a fresh RSA key pair
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const privatePem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const kid = `emergency-rsa-${Date.now()}`;

  // Store the private key in the environment so the KMS provider can use it.
  // WARNING: This is a temporary measure. In production, the private key
  // should be stored in a secure KMS/HSM, not in an environment variable.
  const existingKeys = process.env.MAP_SIGNING_KEYS
    ? JSON.parse(process.env.MAP_SIGNING_KEYS)
    : [];
  const newKeyEntry = {
    kid,
    alg: "RS256" as const,
    private_key_pem: privatePem,
    public_key_pem: publicPem,
    status: "active" as const,
    demo_only: false,
    scopes: [
      "descriptor",
      "delegation_token",
      "receipt",
      "http_request",
      "audit_checkpoint",
      "audit_export",
      "conformance_export",
      "trust_bundle",
    ],
  };
  process.env.MAP_SIGNING_KEYS = JSON.stringify([...existingKeys, newKeyEntry]);
  process.env.MAP_SIGNING_ACTIVE_KID = kid;

  // Reset the KMS provider cache so the new key is picked up
  resetKMSProvider();

  return {
    kid,
    public_key_pem: publicPem,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Revoke All Keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emergency revokes ALL active and retiring keys.
 *
 * This function:
 * 1. Enumerates all keys via the active KMS provider.
 * 2. Revokes every key that is not already revoked.
 * 3. Logs a critical audit event with the reason.
 * 4. Generates an emergency replacement key (if MAP_EMERGENCY_KEY is set,
 *    or generates a fresh RSA key pair).
 * 5. Returns the new emergency key ID.
 *
 * @param reason - A human-readable reason for the mass revocation.
 *                 This is recorded in the audit trail for forensic analysis.
 * @returns The new emergency signing key's metadata.
 */
export async function emergencyRevokeAllKeys(
  reason: string,
): Promise<{ kid: string; secret?: string; public_key_pem?: string }> {
  const provider = getActiveKMSProvider();
  const allKeys = await provider.listKeys();

  const revokedKeyIds: string[] = [];
  const errors: string[] = [];

  // Revoke every active and retiring key
  for (const key of allKeys) {
    if (key.status === "revoked") {
      continue; // Already revoked
    }
    try {
      await provider.revokeKey(key.kid, reason);
      revokedKeyIds.push(key.kid);
    } catch (err) {
      errors.push(
        `Failed to revoke key ${key.kid}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Log the critical audit event
  const auditEvent = {
    timestamp: new Date().toISOString(),
    code: "emergency_key_compromise",
    severity: "critical" as const,
    message: `EMERGENCY KEY COMPROMISE: All keys revoked. Reason: ${reason}`,
    revoked_key_ids: revokedKeyIds,
    errors: errors.length > 0 ? errors : undefined,
  };

  // Write to stderr so it's captured even if stdout is redirected
  console.error(
    `[CRITICAL] ${auditEvent.timestamp} — ${auditEvent.code}: ${auditEvent.message}`,
  );
  if (auditEvent.errors) {
    for (const err of auditEvent.errors) {
      console.error(`[CRITICAL] Revocation error: ${err}`);
    }
  }

  // Generate emergency replacement key
  const emergencyKey = await generateEmergencyKey();

  // Record the compromise for status queries
  _compromiseRecord = {
    compromised: true,
    revoked_at: auditEvent.timestamp,
    reason,
    emergency_key_id: emergencyKey.kid,
    revoked_key_ids: revokedKeyIds,
  };

  return emergencyKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compromise Status Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current key compromise status.
 *
 * After `emergencyRevokeAllKeys()` has been called, this returns:
 * ```
 * { compromised: true, revoked_at: "<ISO timestamp>", reason: "..." }
 * ```
 *
 * If no emergency revocation has occurred, returns:
 * ```
 * { compromised: false }
 * ```
 */
export function verifyCompromiseStatus(): {
  compromised: boolean;
  revoked_at?: string;
  reason?: string;
} {
  if (!_compromiseRecord || !_compromiseRecord.compromised) {
    return { compromised: false };
  }
  return {
    compromised: true,
    revoked_at: _compromiseRecord.revoked_at,
    reason: _compromiseRecord.reason,
  };
}

/**
 * Returns the full compromise record (for admin dashboards).
 */
export function getCompromiseRecord(): CompromiseRecord | null {
  return _compromiseRecord;
}

/**
 * Resets the compromise record.  Used for testing.
 */
export function resetCompromiseRecord(): void {
  _compromiseRecord = null;
}
