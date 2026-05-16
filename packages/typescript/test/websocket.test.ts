/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WebSocketTransport } from '../dist/transport/websocket.js';

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;
  let mockWs: any;
  let mockWebSocket: any;

  beforeEach(() => {
    // Create mock WebSocket
    mockWs = {
      readyState: 1, // OPEN
      binaryType: '',
      close: mock.fn(),
      send: mock.fn(),
      onopen: null,
      onerror: null,
      onclose: null,
      onmessage: null,
    };

    mockWebSocket = mock.fn(() => mockWs);

    transport = new WebSocketTransport('wss://localhost:8080/ws', {
      timeout: 5000,
      reconnect: false,
    });
  });

  describe('constructor', () => {
    it('should create transport with default options', () => {
      const t = new WebSocketTransport('wss://localhost:8080');
      assert.ok(t);
    });

    it('should create transport with custom options', () => {
      const t = new WebSocketTransport('wss://localhost:8080', {
        timeout: 10000,
        reconnect: true,
        reconnectIntervalMs: 2000,
        maxReconnectAttempts: 3,
        pingIntervalMs: 15000,
        pingTimeoutMs: 3000,
      });
      assert.ok(t);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      assert.strictEqual(transport.isConnected(), false);
    });
  });
});

describe('BatchDispatchResult', () => {
  it('should have correct structure for batch results', () => {
    const result = {
      results: [] as any[],
      errors: [
        { index: 0, error: { code: 'agent_not_found', message: 'Agent not found', status: 404 } },
      ],
    };

    assert.ok(Array.isArray(result.results));
    assert.ok(Array.isArray(result.errors));
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].index, 0);
    assert.strictEqual(result.errors[0].error.code, 'agent_not_found');
  });
});
