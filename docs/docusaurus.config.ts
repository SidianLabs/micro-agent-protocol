/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'MAP Protocol',
  tagline: 'Micro Agent Protocol - Open standard for AI assistant to micro-agent delegation',
  favicon: 'img/favicon.ico',
  url: 'https://maprotocol.ai',
  baseUrl: '/',
  organizationName: 'mapprotocol',
  projectName: 'map',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: './docs',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/mapprotocol/map/edit/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.jpg',
    navbar: {
      title: 'MAP Protocol',
      logo: {
        alt: 'MAP Protocol Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/mapprotocol/map',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
            {
              label: 'Protocol Specification',
              to: '/docs/protocol-spec',
            },
          ],
        },
        {
          title: 'SDKs',
          items: [
            {
              label: 'TypeScript SDK',
              to: '/docs/sdk/typescript',
            },
            {
              label: 'Python SDK',
              to: '/docs/sdk/python',
            },
            {
              label: 'Go SDK',
              to: '/docs/sdk/go',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/mapprotocol/map/discussions',
            },
            {
              label: 'Discord',
              href: 'https://discord.gg/mapprotocol',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} MAP Protocol Authors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
