/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac, createSign } from 'crypto';

/**
 * Signer options
 */
export interface SignerOptions {
  type: 'hmac' | 'rsa';
  keyId: string;
  secret?: string;
  privateKey?: string;
}

/**
 * Signer interface
 */
export interface Signer {
  sign(method: string, path: string, timestamp: string, bodyHash: string): Promise<string>;
  hashBody(body: string | undefined): Promise<string>;
  readonly keyId: string;
}

/**
 * HMAC signer implementation
 */
export class HMACSigner implements Signer {
  constructor(
    public readonly keyId: string,
    private readonly secret: string
  ) {
    if (!secret) {
      throw new Error('HMAC signing requires a secret');
    }
  }

  async sign(method: string, path: string, timestamp: string, bodyHash: string): Promise<string> {
    const input = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const hmac = createHmac('sha256', this.secret);
    hmac.update(input);
    return hmac.digest('base64url');
  }

  async hashBody(body: string | undefined): Promise<string> {
    if (!body) return '';
    const hmac = createHmac('sha256', this.secret);
    hmac.update(body);
    return hmac.digest('base64url');
  }
}

/**
 * RSA signer implementation
 */
export class RSASigner implements Signer {
  constructor(
    public readonly keyId: string,
    private readonly privateKey: string
  ) {
    if (!privateKey) {
      throw new Error('RSA signing requires a private key');
    }
  }

  async sign(method: string, path: string, timestamp: string, bodyHash: string): Promise<string> {
    const input = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const sign = createSign('RSA-SHA256');
    sign.update(input);
    return sign.sign(this.privateKey, 'base64url');
  }

  async hashBody(body: string | undefined): Promise<string> {
    if (!body) return '';
    const { createHash } = await import('crypto');
    return createHash('sha256').update(body).digest('base64url');
  }
}

/**
 * HTTPSigner for MAP signed requests
 */
export interface SignerConfig {
  keyId: string;
  sign(method: string, path: string, timestamp: string, bodyHash: string): Promise<string>;
  hashBody(body: string | undefined): Promise<string>;
}

/**
 * Create a signer from options
 */
export function createSigner(options: SignerOptions): Signer {
  if (options.type === 'hmac') {
    return new HMACSigner(options.keyId, options.secret ?? '');
  }
  if (options.type === 'rsa') {
    return new RSASigner(options.keyId, options.privateKey ?? '');
  }
  throw new Error(`Unknown signer type: ${(options as { type: string }).type}`);
}
