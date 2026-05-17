/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';

export default function Home(): JSX.Element {
  return (
    <Layout
      title="MAP Protocol"
      description="Policy-aware micro-agent execution with receipts, approvals, and protocol-grade controls."
    >
      <main
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '5rem 1.5rem',
        }}
      >
        <h1>MAP Protocol</h1>
        <p>
          MAP is a protocol and reference implementation for policy-aware
          micro-agent execution, approval workflows, and signed receipts.
        </p>
        <p>
          <Link to="/docs/getting-started">Open the documentation</Link>
        </p>
      </main>
    </Layout>
  );
}
