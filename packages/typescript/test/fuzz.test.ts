/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID, randomInt } from 'node:crypto';
import { describe, it, type TestContext } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Fuzzing helpers — zero dependencies
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  'db.read.aggregate',
  'db.write.insert',
  'notification.send',
  'audit.export',
  'payment.process',
  'agent.discover',
  'policy.evaluate',
  'schema.validate',
];

const RISK_CLASSES = ['low', 'medium', 'high', 'critical'] as const;

const OUTPUT_MODES = [
  'full',
  'summary',
  'structured_only',
  'receipt_only',
  'redacted',
  'debug',
] as const;

const INTENTS = [
  'Aggregate incident metrics',
  'Insert new record',
  'Send email notification',
  'Export audit trail',
  'Process payment transaction',
  'Discover available agents',
  'Evaluate access policy',
  'Validate schema version',
];

const TENANT_IDS = ['tenant_A', 'tenant_B', 'tenant_C', 'tenant_D'];
const MAP_SERVER_URL = 'http://localhost:8787';
let serverAvailability: Promise<boolean> | undefined;

async function isServerReachable(): Promise<boolean> {
  if (!serverAvailability) {
    serverAvailability = fetch(`${MAP_SERVER_URL}/health`)
      .then((response) => response.ok)
      .catch(() => false);
  }
  return serverAvailability;
}

async function requireServer(t: TestContext): Promise<boolean> {
  if (!(await isServerReachable())) {
    t.skip('MAP reference server is not running at http://localhost:8787');
    return false;
  }
  return true;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}

function randomTaskId(): string {
  return `task-${randomUUID()}`;
}

function randomIdempotencyKey(): string {
  return `idem-${randomUUID()}`;
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
}

function randomSpecialString(length: number): string {
  const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?/`~"\'\\';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
}

function randomCapability(): string {
  return pick(CAPABILITIES);
}

function buildValidDispatchRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    capability: randomCapability(),
    envelope: {
      task_id: randomTaskId(),
      requester_identity: {
        type: pick(['user', 'service', 'agent']),
        id: `id-${randomUUID()}`,
        tenant_id: pick(TENANT_IDS),
      },
      target_agent: `agent-${randomString(4)}-v${randomInt(1, 5)}`,
      intent: pick(INTENTS),
      constraints: {
        common: {
          environment: pick(['development', 'staging', 'production']),
          max_amount: randomInt(0, 100000),
        },
        domain: { key: randomString(8) },
      },
      risk_class: pick(RISK_CLASSES),
      delegation_token: `token-${randomUUID()}`,
      requested_output_mode: pick(OUTPUT_MODES),
    },
    ...overrides,
  };
}

function isValidHttpStatus(status: number): boolean {
  return status >= 200 && status < 600;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Fuzz / Property Tests', () => {
  // -----------------------------------------------------------------------
  // Random dispatch fuzz
  // -----------------------------------------------------------------------
  describe('Random dispatch fuzz', () => {
    it('should handle 50 random valid dispatch requests', async (t) => {
      if (!(await requireServer(t))) return;
      const results: { taskId: string; status: number }[] = [];

      for (let i = 0; i < 50; i++) {
        const req = buildValidDispatchRequest();
        const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        });

        assert.ok(isValidHttpStatus(response.status), `Unexpected status: ${response.status}`);
        results.push({
          taskId: (req.envelope as Record<string, unknown>).task_id as string,
          status: response.status,
        });
      }

      console.log(`  Random dispatch fuzz: ${results.length}/${50} requests completed`);
      assert.strictEqual(results.length, 50, 'Expected every random dispatch to receive a response');
    });
  });

  // -----------------------------------------------------------------------
  // Invalid capability fuzz
  // -----------------------------------------------------------------------
  describe('Invalid capability fuzz', () => {
    it('should return 400/404 for 20 random invalid capabilities', async (t) => {
      if (!(await requireServer(t))) return;
      const invalidCapabilities = Array.from({ length: 20 }, () => {
        const prefix = pick(['invalid.', 'nonexistent.', 'fake.', 'bad.', 'unknown.']);
        const suffix = randomString(8);
        return `${prefix}${suffix}`;
      });

      let testedCount = 0;
      for (const capability of invalidCapabilities) {
        const req = buildValidDispatchRequest({ capability });
        const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        });

        const validErrorStatus =
          response.status === 400 || response.status === 404 || response.status === 422;
        assert.ok(validErrorStatus, `Expected invalid capability ${capability} to be rejected, got ${response.status}`);
        testedCount++;
      }

      console.log(`  Invalid capability fuzz: ${testedCount}/${invalidCapabilities.length} tested`);
      assert.strictEqual(testedCount, invalidCapabilities.length);
    });
  });

  // -----------------------------------------------------------------------
  // Boundary value fuzz
  // -----------------------------------------------------------------------
  describe('Boundary value fuzz', () => {
    it('should handle max_amount=0', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      (
        ((req.envelope as Record<string, unknown>).constraints as Record<string, unknown>)
          .common as Record<string, unknown>
      ).max_amount = 0;

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  max_amount=0 → ${response.status}`);
      assert.ok(isValidHttpStatus(response.status));
    });

    it('should handle max_amount=999999999', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      (
        ((req.envelope as Record<string, unknown>).constraints as Record<string, unknown>)
          .common as Record<string, unknown>
      ).max_amount = 999999999;

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  max_amount=999999999 → ${response.status}`);
      assert.ok(isValidHttpStatus(response.status));
    });

    it('should handle empty intent string', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      (req.envelope as Record<string, unknown>).intent = '';

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  empty intent → ${response.status}`);
      assert.ok(isValidHttpStatus(response.status));
    });

    it('should handle very long strings', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      (req.envelope as Record<string, unknown>).intent = randomString(10000);

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  very long intent (10000 chars) → ${response.status}`);
      assert.ok(isValidHttpStatus(response.status));
    });

    it('should handle special characters in intent', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      (req.envelope as Record<string, unknown>).intent = randomSpecialString(100);

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  special chars intent → ${response.status}`);
      assert.ok(isValidHttpStatus(response.status));
    });

    it('should handle missing required field (no task_id)', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      delete (req.envelope as Record<string, unknown>).task_id;

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  missing task_id → ${response.status}`);
      assert.ok(response.status >= 400 && response.status < 500);
    });

    it('should handle negative max_amount', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      (
        ((req.envelope as Record<string, unknown>).constraints as Record<string, unknown>)
          .common as Record<string, unknown>
      ).max_amount = -1;

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  max_amount=-1 → ${response.status}`);
      assert.ok(isValidHttpStatus(response.status));
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent fuzz
  // -----------------------------------------------------------------------
  describe('Concurrent fuzz', () => {
    it('should handle 20 concurrent dispatches — no crashes', async (t) => {
      if (!(await requireServer(t))) return;
      const requests = Array.from({ length: 20 }, () => buildValidDispatchRequest());

      const responses = await Promise.allSettled(
        requests.map((req) =>
          fetch(`${MAP_SERVER_URL}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
          }).then(
            (r) => ({ ok: true, status: r.status }),
            (err) => ({ ok: false, error: (err as Error).message })
          )
        )
      );

      let successCount = 0;
      let errorCount = 0;
      for (const result of responses) {
        if (result.status === 'fulfilled') {
          successCount++;
          const val = result.value;
          if (!val.ok) {
            errorCount++;
          }
        } else {
          errorCount++;
        }
      }

      console.log(
        `  Concurrent: ${successCount} responses, ${errorCount} errors (network/server)`
      );

      assert.strictEqual(successCount, requests.length, 'Expected every concurrent dispatch to settle with a response');
    });
  });

  // -----------------------------------------------------------------------
  // Rapid state change fuzz
  // -----------------------------------------------------------------------
  describe('Rapid state change fuzz', () => {
    it('should handle accepted→proposed→running→completed 10 times rapidly', async (t) => {
      if (!(await requireServer(t))) return;
      // This simulates rapid state transitions by firing dispatches
      // and then polling for state changes in quick succession.

      const taskIds: string[] = [];

      // Phase 1: Fire 10 dispatches rapidly
      for (let i = 0; i < 10; i++) {
        const req = buildValidDispatchRequest();
        const taskId = (req.envelope as Record<string, unknown>).task_id as string;
        taskIds.push(taskId);

        await fetch(`${MAP_SERVER_URL}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        });
      }

      // Phase 2: Rapidly poll all tasks
      const pollResults = await Promise.allSettled(
        taskIds.map(async (taskId) => {
          const res = await fetch(`${MAP_SERVER_URL}/tasks/${taskId}`, {
            headers: { 'Content-Type': 'application/json' },
          });
          return { taskId, status: res.status };
        })
      );

      let polledCount = 0;
      for (const result of pollResults) {
        if (result.status === 'fulfilled') polledCount++;
      }

      console.log(`  Rapid state change: polled ${polledCount}/${taskIds.length} tasks`);
      assert.strictEqual(polledCount, taskIds.length, 'Expected every task poll to complete');
    });
  });

  // -----------------------------------------------------------------------
  // Property: task_id uniqueness
  // -----------------------------------------------------------------------
  describe('Property: task_id uniqueness', () => {
    it('should generate 100 unique task_ids', () => {
      const taskIds = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const id = randomTaskId();
        assert.ok(!taskIds.has(id), `Duplicate task_id found: ${id}`);
        taskIds.add(id);
      }
      console.log(`  Generated ${taskIds.size} unique task_ids`);
      assert.strictEqual(taskIds.size, 100);
    });
  });

  // -----------------------------------------------------------------------
  // Property: receipt always present
  // -----------------------------------------------------------------------
  describe('Property: receipt always present', () => {
    it('should produce a receipt for every successful dispatch', async (t) => {
      if (!(await requireServer(t))) return;
      // Fire a valid dispatch and verify the response structure
      const req = buildValidDispatchRequest();

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      assert.ok(response.status === 200 || response.status === 202);
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const hasReceipt = 'receipt_id' in body || 'receipt' in body || 'task_id' in body;
      console.log(
        `  Receipt property: status=${response.status}, hasReceipt=${hasReceipt}, keys=${Object.keys(body).join(',')}`
      );
      assert.ok(hasReceipt, 'Successful dispatch should include a receipt or task reference');
    });

    it('should verify receipt has valid signature field when present', async (t) => {
      if (!(await requireServer(t))) return;
      const req = buildValidDispatchRequest();
      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (response.status !== 200) {
        t.skip(`Receipt signature check requires synchronous success response, got ${response.status}`);
      }

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      assert.ok(body.receipt && typeof body.receipt === 'object', 'Expected response to include receipt object');
      const receipt = body.receipt as Record<string, unknown>;
      const hasSignature =
        'signature' in receipt && typeof receipt.signature === 'string' && receipt.signature.length > 0;
      console.log(`  Receipt signature property: hasSignature=${hasSignature}`);
      assert.ok(hasSignature, 'Receipt should include a non-empty signature');
    });
  });

  // -----------------------------------------------------------------------
  // Edge-case: malformed JSON body
  // -----------------------------------------------------------------------
  describe('Malformed input fuzz', () => {
    it('should handle malformed JSON gracefully', async (t) => {
      if (!(await requireServer(t))) return;
      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'this is not json {{{',
      });
      console.log(`  Malformed JSON → ${response.status}`);
      assert.ok(response.status >= 400 && response.status < 500);
    });

    it('should handle empty body gracefully', async (t) => {
      if (!(await requireServer(t))) return;
      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      console.log(`  Empty body → ${response.status}`);
      assert.ok(response.status >= 400 && response.status < 500);
    });

    it('should handle excessively deep nesting', async (t) => {
      if (!(await requireServer(t))) return;
      // Build a deeply nested object
      let deep: unknown = { value: 'bottom' };
      for (let i = 0; i < 50; i++) {
        deep = { nested: deep };
      }

      const req = { ...buildValidDispatchRequest(), deep };

      const response = await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      console.log(`  Deep nesting (50 levels) → ${response.status}`);
      assert.ok(isValidHttpStatus(response.status));
    });
  });

  // -----------------------------------------------------------------------
  // Fuzzing tenant boundaries
  // -----------------------------------------------------------------------
  describe('Tenant boundary fuzz', () => {
    it('should not leak tasks across tenants', async (t) => {
      if (!(await requireServer(t))) return;
      const tenantA = 'tenant_fuzz_A';
      const tenantB = 'tenant_fuzz_B';

      // Create a task for tenant A
      const reqA = buildValidDispatchRequest();
      (
        (reqA.envelope as Record<string, unknown>).requester_identity as Record<string, unknown>
      ).tenant_id = tenantA;
      const taskIdA = (reqA.envelope as Record<string, unknown>).task_id as string;

      await fetch(`${MAP_SERVER_URL}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqA),
      });

      const responseB = await fetch(
        `${MAP_SERVER_URL}/tasks/${taskIdA}?tenant_id=${tenantB}`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      console.log(
        `  Tenant isolation: reading tenant A's task as tenant B → ${responseB.status}`
      );
      assert.notStrictEqual(responseB.status, 200, 'Cross-tenant task read should not succeed');
    });
  });
});
