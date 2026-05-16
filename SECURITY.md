<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :x:                |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue
in MAP Protocol, please report it responsibly.

### How to Report

**DO NOT** file a public GitHub issue for security vulnerabilities.

Please report vulnerabilities via one of:

1. **Email**: security@map-protocol.dev
2. **GitHub Private Vulnerability Reporting**:
   Go to the Security tab of this repository and click "Report a vulnerability"

### What to Include

Please include as much of the following as possible:

- Type of vulnerability (e.g., XSS, injection, authentication bypass, etc.)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment and severity estimation
- Any suggested remediation

### Response Timeline

| Phase | Timeline |
|-------|----------|
| Initial Response | Within 48 hours |
| Assessment & Triage | Within 7 days |
| Fix Development | Based on severity |
| Disclosure | After fix is available |

### Severity Classification

We use CVSS (Common Vulnerability Scoring System) for severity assessment:

| Severity | CVSS Score | Response |
|----------|------------|----------|
| Critical | 9.0-10.0 | Emergency fix within 24 hours |
| High | 7.0-8.9 | Fix within 7 days |
| Medium | 4.0-6.9 | Fix within 30 days |
| Low | 0.1-3.9 | Fix in next scheduled release |

### What to Expect After Reporting

1. **Acknowledgment**: You'll receive an initial response within 48 hours
2. **Assessment**: We'll evaluate the severity and impact
3. **Status Updates**: We'll keep you updated on progress
4. **Credit**: With your permission, we'll credit you in the release notes
5. **Disclosure**: Coordinated disclosure after the fix is released

### Security Update Process

Security updates will be released as patch versions (e.g., 1.0.1) and announced via:

- GitHub Security Advisories
- Release notes with security section
- Project mailing list (security-announce@map-protocol.dev)

### Scope

This security policy applies to:

- MAP Protocol specification
- Reference implementation
- Official SDKs (TypeScript, Python, Go)
- This GitHub repository

For third-party dependencies, please report to the respective project's
security team.

### Security Best Practices for MAP Deployments

When deploying MAP Protocol in production:

1. **Use TLS 1.2+** for all communications
2. **Rotate signing keys regularly** per your security policy
3. **Validate agent descriptors** before trusting them
4. **Monitor audit receipts** for anomalies
5. **Implement least-privilege** for delegation tokens
6. **Use regulated deployment profile** for sensitive operations

### Security References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CVE Program](https://cve.mitre.org/)
- [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories)
- [CVSS Calculator](https://www.first.org/cvss/calculator/3.1)

### Encryption

MAP Protocol uses the following encryption:

| Operation | Algorithm | Notes |
|-----------|-----------|-------|
| Request Signing (HMAC) | HMAC-SHA256 | Symmetric, for development |
| Request Signing (RSA) | RS256 | Asymmetric, for production |
| Token Signatures | Same as request signing | Based on deployment profile |
| Receipt Signatures | Same as request signing | Immutable audit trail |

### Responsible Disclosure

We follow responsible disclosure practices:

1. Reporters should keep vulnerability details confidential until a fix is available
2. We will work with reporters on disclosure timing
3. We credit reporters in security advisories (with permission)
4. We do not pursue legal action against good-faith security researchers

Thank you for helping keep MAP Protocol secure.

---

For general security questions, please use GitHub Discussions or email
security@map-protocol.dev (not for vulnerability reports).
