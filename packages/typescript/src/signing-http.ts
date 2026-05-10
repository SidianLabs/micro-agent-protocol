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

  async signRequest(
    method: string,
    path: string,
    timestamp: string,
    body: string | undefined
  ): Promise<{ signature: string; bodyHash: string }> {
    const bodyHash = await this.hashBody(body);
    const input = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const hmac = createHmac('sha256', this.secret);
    hmac.update(input);
    const signature = hmac.digest('base64url');
    return { signature, bodyHash };
  }

  async hashBody(body: string | undefined): Promise<string> {
    if (!body) return '';
    const hmac = createHmac('sha256', this.secret);
    hmac.update(body);
    return hmac.digest('base64url');
  }
}
