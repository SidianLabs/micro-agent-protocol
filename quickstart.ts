#!/usr/bin/env node
/**
 * MAP Protocol — Quickstart Demo
 *
 * Run: npm run quickstart
 * Shows: policy creation, capability execution, approval flow, and receipts.
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { map } from './src/map.js';

const agent = map({
  policy: [
    { when: 'payment.execute', amount_gt: 1000, require: 'approval' },
    { when: 'email.send', amount_gt: 100, require: 'approval' },
    { when: 'db.write', env: 'production', require: 'deny' },
    { when: 'payment.execute', amount_lte: 1000, require: 'allow' },
    { when: '*', require: 'allow' },
  ],
  onApprovalRequired: async ({ capability, input_summary, approval_reference }) => {
    console.log(`[approval] required for ${capability} | input=${JSON.stringify(input_summary)} | ref=${approval_reference}`);
  },
});

agent.can('payment.execute', async (input) => ({
  charge_id: 'ch_' + Math.random().toString(36).slice(2, 10),
  amount: input.amount,
  currency: input.currency ?? 'USD',
  status: 'succeeded',
  created: new Date().toISOString(),
}));

agent.can('email.send', async (input) => ({
  message_id: 'msg_' + Math.random().toString(36).slice(2, 10),
  to: input.to,
  subject: input.subject,
  status: 'sent',
}));

const r1 = await agent.run('payment.execute', { amount: 50, currency: 'USD' });
console.log('[exec] payment.execute $50 => ' + r1.status);

const r2 = await agent.run('payment.execute', { amount: 5000, currency: 'USD' });
console.log('[exec] payment.execute $5000 => ' + r2.status + (r2.status === 'approval_required' ? ' ref=' + r2.approval_reference : ''));

const check = agent.check('payment.execute', { amount: 2000 });
console.log('[check] payment.execute $2000 => ' + check.action + ' reason=' + (check.reason ?? 'n/a'));

const dryRun = agent.check('db.write', { sql: 'DROP TABLE users;', env: 'production' });
console.log('[check] db.write prod => ' + dryRun.action + ' reason=' + (dryRun.reason ?? 'n/a'));

console.log('[done] run `npm run dev:demo-server` to explore the full server API');