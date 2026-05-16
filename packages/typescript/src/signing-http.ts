/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac, randomUUID } from 'crypto';

/**
 * Stable stringify that produces deterministic JSON output
 * by sorting object keys alphabetically.
 */
function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => stableStringify(item));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
    );
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value);
}

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
  ): Promise<{ signature: string; bodyHash: string; nonce: string }> {
    const bodyHash = await this.hashBody(body);
    const nonce = randomUUID();

    // Create JWS-like compact serialization
    const header = {
      alg: 'HS256',
      kid: this.kid,
      nonce: nonce,
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

    // Base64url encode header and payload using stable serialization
    const encodedHeader = Buffer.from(stableStringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(stableStringify(payload)).toString('base64url');

    // Sign the "header.payload" string
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const hmac = createHmac('sha256', this.secret);
    hmac.update(signingInput);
    const signature = hmac.digest('base64url');

    // Return full JWS-like signature
    return { signature: `${signingInput}.${signature}`, bodyHash, nonce };
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
