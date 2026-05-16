/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Backward-compatibility re-export.
 *
 * Use ./middleware/auth.js instead for new code.
 */
export {
  getRequiredAuthScheme,
  getSignedRequestError,
  getBearerTokenError,
  validateOAuth2Token,
  getOAuth2Jwks,
  hashToken,
  extractBearerToken,
} from "./middleware/auth.js";

export type {
  AuthError,
  AuthResult,
  AuthMiddlewareOptions,
} from "./middleware/auth.js";
