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
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'http-transport',
        'capability-schemas',
        'constraint-vocabulary',
      ],
    },
  ],
};

export default sidebars;