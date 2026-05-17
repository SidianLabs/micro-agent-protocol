/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    {
      type: 'doc',
      id: 'getting-started',
      label: 'Getting Started',
    },
    {
      type: 'category',
      label: 'Protocol',
      collapsed: false,
      items: [
        'protocol-spec',
        'protocol-core-v1',
        'protocol-guidance-v1',
      ],
    },
    {
      type: 'category',
      label: 'SDKs',
      items: [
        'sdk/typescript',
        'sdk/python',
        'sdk/go',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture',
        'security-model',
        'authentication-model',
        'deployment',
        'deployment-profiles',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'http-transport',
        'capability-schemas',
        'constraint-vocabulary',
        'version-negotiation',
        'registry-discovery',
        'registry-trust',
        'signing-model',
        'key-management',
        'conformance-certification',
        'security-guide',
      ],
    },
  ],
};

export default sidebars;
