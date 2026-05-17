#!/usr/bin/env node
/**
 * MAP Protocol — Quickstart Demo
 *
 * This script demonstrates the MAP TypeScript SDK end-to-end:
 * 1. Creates a MAP agent with a policy
 * 2. Runs a capability that is allowed
 * 3. Runs a capability that requires approval (dry-run)
 * 4. Shows the signed receipt
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { map } from './src/map.js';

console.log('🟢 MAP Protocol Quickstart\n');

// 1. Create agent with policy
const agent = map({
  policy: [
    // High-value payments: require approval
    { when: 'payment.execute', amount_gt: 1000, require: 'approval' },
    // Bulk email: require approval
    { when: 'email.send', amount_gt: 100, require: 'approval' },
    // Database writes in production: deny
    { when: 'db.write', env: 'production', require: 'deny' },
    // Low-value payments: allow
    { when: 'payment.execute', amount_lte: 1000, require: 'allow' },
    // Default: allow
    { when: '*', require: 'allow' },
  ],
  onApprovalRequired: async ({ capability, input_summary, approval_reference }) => {
    console.log(`\n  📋 Approval required for: ${capability}`);
    console.log(`     Input: ${JSON.stringify(input_summary)}`);
    console.log(`     Reference: ${approval_reference}`);
    console.log(`     (In production, this would notify a human via Slack/email)`);
  },
});

console.log('✓ Agent created with policy');

// 2. Register payment handler
agent.can('payment.execute', async (input) => {
  return {
    charge_id: 'ch_' + Math.random().toString(36).slice(2, 10),
    amount: input.amount,
    currency: input.currency ?? 'USD',
    status: 'succeeded',
    created: new Date().toISOString(),
  };
});

// 3. Register email handler
agent.can('email.send', async (input) => {
  return {
    message_id: 'msg_' + Math.random().toString(36).slice(2, 10),
    to: input.to,
    subject: input.subject,
    status: 'sent',
  };
});

// 4. Run a low-value payment (should be allowed)
console.log('\n📤 Running: payment.execute (amount=$50 — below threshold)');
const result1 = await agent.run('payment.execute', { amount: 50, currency: 'USD' });
console.log(`   Status: ${result1.status}`);
console.log(`   Output: ${JSON.stringify(result1.output)}`);
if (result1.receipt) {
  console.log(`   Receipt ID: ${result1.receipt.receipt_id ?? result1.receipt.receiptId ?? 'N/A'}`);
  console.log(`   Signature: ${String(result1.receipt.signature ?? '').slice(0, 40)}...`);
}

// 5. Run a high-value payment (should require approval)
console.log('\n📤 Running: payment.execute (amount=$5000 — above threshold)');
const result2 = await agent.run('payment.execute', { amount: 5000, currency: 'USD' });
console.log(`   Status: ${result2.status}`);
if (result2.status === 'approval_required') {
  console.log(`   Approval reference: ${result2.approval_reference}`);
}

// 6. Check policy without executing
console.log('\n🔍 Policy check: payment.execute (amount=$2000)');
const check = agent.check('payment.execute', { amount: 2000 });
console.log(`   Action: ${check.action}`);
console.log(`   Reason: ${check.reason ?? 'N/A'}`);

// 7. Dry run
console.log('\n🔍 Dry run: db.write (env=production)');
const dryRun = agent.check('db.write', { sql: 'DROP TABLE users;', env: 'production' });
console.log(`   Action: ${dryRun.action}`);
console.log(`   Reason: ${dryRun.reason ?? 'N/A'}`);

console.log('\n✅ Quickstart complete!\n');
console.log('Next steps:');
console.log('  • Read the docs: https://map-protocol.dev/docs');
console.log('  • Run the demo server: npm run dev:demo-server');
console.log('  • Explore the SDK: packages/typescript/');
console.log('  • Read the spec: spec/MAP-SPEC-v1.md\n');