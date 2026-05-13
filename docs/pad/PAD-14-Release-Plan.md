# PAD-14: Release Plan

**Project:** MAP Protocol Open Source Release  
**Status:** Draft  
**Last Updated:** 2026-03-30

## 1. Release Overview

### 1.1 Release Scope

Initial open source release of MAP (Micro Agent Protocol) including:
- TypeScript SDK (`@mapprotocol/sdk`)
- Python SDK (`mapprotocol`)
- Go SDK (`github.com/mapprotocol/map/packages/go/mapproto`)
- OpenAPI 3.1 Specification
- Conformance Test Suite
- Documentation (Docusaurus)

### 1.2 Release Version

**Version:** 1.0.0-alpha.1  
**Release Type:** Alpha (public preview)

### 1.3 Release Timeline

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| PAD-01 to PAD-13 Complete | Week 1 | ✓ Complete |
| PAD-14 Release Plan | Week 1 | ← Current |
| Beta SDKs Available | Week 4 | Pending |
| Conformance Tests Pass | Week 6 | Pending |
| Documentation Complete | Week 8 | Pending |
| GA Release | Week 12 | Pending |

## 2. Pre-Release Checklist

### 2.1 Legal & Governance

- [x] Apache 2.0 License file created
- [x] NOTICE file created
- [x] SECURITY.md policy created
- [x] CODE_OF_CONDUCT.md created
- [x] CONTRIBUTING.md created
- [x] MAINTAINERS.md created
- [x] GitHub Issue Templates created
- [x] Pull Request Template created

### 2.2 Code Quality

- [ ] All TypeScript SDK tests passing
- [ ] All Python SDK tests passing
- [ ] All Go SDK tests passing
- [x] Schema conformance tests passing
- [x] Protocol spec tests passing
- [ ] ESLint/Prettier passing
- [ ] No critical security vulnerabilities

### 2.3 Documentation

- [ ] Docusaurus site builds successfully
- [ ] Getting Started guide complete
- [ ] SDK reference documentation complete
- [ ] Protocol specification complete
- [ ] API reference (OpenAPI) complete

### 2.4 CI/CD

- [ ] GitHub Actions CI pipeline passing
- [ ] GitHub Actions Conformance tests passing
- [ ] GitHub Actions Docs deployment working
- [ ] Dependency Review workflow enabled

## 3. Release Process

### 3.1 Version Numbering

MAP Protocol follows Semantic Versioning (SemVer):

```
MAJOR.MINOR.PATCH[-PRERELEASE]
```

- **MAJOR**: Breaking changes to protocol
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible
- **PRERELEASE**: Alpha, beta, rc (e.g., 1.0.0-alpha.1)

### 3.2 Release Channels

| Channel | Version Pattern | Purpose |
|---------|----------------|---------|
| Alpha | 1.0.0-alpha.N | Early feedback, experimental |
| Beta | 1.0.0-beta.N | Feature complete, testing |
| RC | 1.0.0-rc.N | Release candidate, final testing |
| GA | 1.0.0 | General availability |

### 3.3 Release Artifacts

For each release, the following artifacts will be published:

#### NPM Packages (@mapprotocol/*)
- `@mapprotocol/sdk` - TypeScript/JS SDK
- `@mapprotocol/conformance-tests` - Conformance test suite

#### Python Package
- `mapprotocol` - Python SDK (PyPI)

#### Go Module
- `github.com/mapprotocol/map/packages/go/mapproto`

#### Documentation
- Published to https://maprotocol.ai

#### Schema Files
- OpenAPI spec: `schemas/openapi.yaml`
- JSON Schemas: `schemas/*.json`

## 4. Post-Release Activities

### 4.1 Announcement

- [ ] GitHub Release created
- [ ] Blog post published
- [ ] Social media announcements
- [ ] Email to stakeholders

### 4.2 Community Management

- [ ] Monitor GitHub Issues
- [ ] Monitor GitHub Discussions
- [ ] Respond to community questions
- [ ] Triage incoming issues

### 4.3 Maintenance

- [ ] Monitor CI/CD pipelines
- [ ] Review and merge contributions
- [ ] Release patch updates as needed
- [ ] Plan next release

## 5. Roadmap

### 5.1 1.0.0 GA (3 months)

- Stable API
- Full SDK support (TS, Python, Go)
- Comprehensive documentation
- Conformance test suite

### 5.2 1.1.0 (6 months)

- WebSocket transport binding
- Additional language SDKs (Rust, Java)
- Enhanced policy engine
- Observability hooks

### 5.3 2.0.0 (12 months)

- Protocol breaking changes (if needed)
- Multi-agent delegation
- Advanced trust framework
- Enterprise features

## 6. Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low SDK adoption | Medium | Medium | Improve docs, examples |
| Security vulnerabilities | Low | High | Security audit, dependency review |
| Breaking protocol changes | Low | High | Version negotiation, deprecation policy |
| Community contribution low | Medium | Medium | Active outreach, good first issues |

## 7. Success Metrics

### 7.1 Adoption Metrics

- GitHub Stars > 100 (3 months)
- NPM downloads > 1000/month (6 months)
- SDK adoption in 5+ projects (6 months)

### 7.2 Community Metrics

- 10+ contributors (6 months)
- 50+ GitHub discussions (6 months)
- Response time < 48 hours

### 7.3 Quality Metrics

- 0 critical security issues
- 95%+ conformance test pass rate
- < 5% issue reopen rate

## 8. Appendix

### 8.1 Release Checklist Template

```
## Pre-Release
- [ ] All tests passing
- [ ] Documentation complete
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] GitHub Actions passing

## Release
- [ ] Tag created
- [ ] GitHub Release published
- [ ] Packages published to npm
- [ ] Package published to PyPI
- [ ] Go module tagged

## Post-Release
- [ ] Announcement published
- [ ] Social media notified
- [ ] Community monitored
```

### 8.2 Contact

For questions about the release, please contact:
- GitHub Discussions: https://github.com/mapprotocol/map/discussions
- Security issues: See SECURITY.md