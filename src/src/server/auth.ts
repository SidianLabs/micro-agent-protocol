import type { IncomingMessage } from "node:http";
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
): { code: "auth_required" | "invalid_auth" | "token_expired" | "token_invalid_signature"; message: string } | null {
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
      code: "token_invalid_signature",
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
