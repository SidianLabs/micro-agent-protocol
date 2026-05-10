/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac } from 'crypto';

/**
 * Configuration for HTTPSigner
 */
export interface SignerConfig {
  kid: string;
  secret: string;
}

/**
 * HTTPSigner for MAP signed requests using HMAC-SHA256
 */
export class HTTPSigner {
  private readonly secret: string;
  readonly kid: string;

  constructor(kid: string, secret: string) {
    this.kid = kid;
    this.secret = secret;
  }

  /**
   * Sign an HTTP request for MAP Protocol
   * Uses JWS-like compact serialization format
   */
  async signRequest(
    method: string,
    path: string,
    timestamp: string,
    body: string | undefined
  ): Promise<{ signature: string; bodyHash: string }> {
    const bodyHash = await this.hashBody(body);

    // Create JWS-like compact serialization
    const header = {
      alg: 'HS256',
      kid: this.kid,
      typ: 'MAPSIG'
    };

    // Payload with body FIRST (alphabetically, body comes first in JCS canonical order)
    // Note: JSON.stringify preserves insertion order but for JWS the order is body, key_id, method, path, timestamp
    const payload = {
      body: body ?? '',
      key_id: this.kid,
      method: method.toUpperCase(),
      path: path,
      timestamp: timestamp
    };

    // Base64url encode header and payload
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Sign the "header.payload" string
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const hmac = createHmac('sha256', this.secret);
    hmac.update(signingInput);
    const signature = hmac.digest('base64url');

    // Return full JWS-like signature
    return { signature: `${signingInput}.${signature}`, bodyHash };
  }

  /**
   * Hash the request body using HMAC-SHA256
   */
  async hashBody(body: string | undefined): Promise<string> {
    if (!body) return '';
    const hmac = createHmac('sha256', this.secret);
    hmac.update(body);
    return hmac.digest('base64url');
  }
}
