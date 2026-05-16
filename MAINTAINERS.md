<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Maintainers

## Current Maintainers

| Name | GitHub | Role | Email |
|------|--------|------|-------|
| Bhawesh Bhaskar | @BHAWESHBHASKAR | Lead Maintainer | bhawesh@sidian.dev |

## Become a Maintainer

We welcome contributions from the community! To become a maintainer:

1. **Consistently contribute** high-quality patches and reviews
2. **Demonstrate good judgment** in technical decisions
3. **Help others** by answering questions and reviewing PRs
4. **Follow governance** by enforcing CoC and community guidelines
5. **Community approval** - existing maintainers vote

## Responsibilities

Maintainers are responsible for:

### Code Quality

- Reviewing and merging pull requests
- Ensuring code meets quality standards
- Running and monitoring CI/CD pipelines
- Maintaining test coverage

### Community Health

- Managing issues and triaging
- Enforcing code of conduct
- Responding to security concerns
- Welcoming new contributors

### Project Direction

- Setting technical direction
- Approving architectural changes
- Managing releases and versions
- Representing MAP to external stakeholders

## Decision Making

### Consensus Model

Major decisions are made by **rough consensus** among maintainers:

1. Open a GitHub Discussion for significant changes
2. Gather community feedback (minimum 7 days)
3. Maintainers discuss and reach consensus
4. Document the decision and rationale

### Types of Decisions

| Decision Type | Example | Process |
|--------------|---------|---------|
| Minor | Bug fix, docs update | Maintainer approves, merged |
| Moderate | New feature, API change | PR review + 1 approval |
| Major | Breaking change, new SDK | Full RFC process |

### RFC Process

For major changes:

1. Create RFC document in `docs/rfcs/`
2. Open Discussion with RFC link
3. 30-day comment period
4. Maintainer decision
5. Merge or close RFC

## Communication

### Channels

| Channel | Purpose | Response SLA |
|---------|---------|--------------|
| GitHub Issues | Bug reports, features | 48 hours |
| GitHub Discussions | Questions, ideas | 5 days |
| Security Email | Vulnerabilities | 24 hours |
| Maintainer Email | Private matters | 7 days |

### Meetings

We don't have regular meetings. Most coordination happens async via:

- GitHub Issues/PRs
- GitHub Discussions
- Email

## Release Process

Maintainers are responsible for:

1. **Version management** - Deciding when to release
2. **Release notes** - Writing clear changelogs
3. **Package publishing** - Publishing to npm, PyPI, Go proxy
4. **Announcements** - Social media, blog posts

See [RELEASE.md](./RELEASE.md) for full details.

## Handling Disputes

In case of disagreement between maintainers:

1. **Discuss privately** to understand perspectives
2. **Seek community input** via Discussion
3. **Default to consensus** - find middle ground
4. **Escalate if needed** - temporary moderation by senior maintainer

## Emeritus Status

Maintainers who step down become **Emeritus**:

- Listed in this file with `:em:` status
- No longer required to respond
- Can return to active status anytime

## Contact

- **General**: Open a GitHub Issue at https://github.com/SidianLabs/micro-agent-protocol/issues
- **Security**: Report via GitHub Security Advisory at https://github.com/SidianLabs/micro-agent-protocol/security/advisories
- **Code of Conduct**: Open a GitHub Issue labeled "conduct"

## Acknowledgments

This governance model is inspired by:

- [Kubernetes Steering Committee](https://github.com/kubernetes/steering)
- [Node.js Foundation TSC](https://github.com/nodejs/TSC)
- [Rust Moderation Team](https://github.com/rust-lang/team)

---

*Last updated: 2026*
