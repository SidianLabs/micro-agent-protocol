# PAD-09: CI/CD Pipeline Design

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Overview

The MAP Protocol uses GitHub Actions for continuous integration and deployment.

## 2. Workflow Files

### 2.1 CI Pipeline (ci.yml)

Runs on every push and PR to main branch.

**Jobs:**
- `lint` - ESLint and Prettier checks
- `typecheck` - TypeScript type checking
- `test` - Unit tests for all packages
- `build` - Build verification

### 2.2 Conformance Tests (conformance.yml)

Runs conformance test suite against the protocol specification.

**Jobs:**
- `spec-tests` - Core protocol tests
- `schema-tests` - JSON Schema validation tests
- `sdk-tests` - SDK compatibility tests

### 2.3 Release (release.yml)

Handles version bumps and package publishing.

**Triggers:**
- Push to `release/*` branches
- Manual workflow dispatch with version input

**Jobs:**
- `version-bump` - Update version in all packages
- `create-changelog` - Generate changelog
- `publish-packages` - Publish to npm, PyPI, Go proxy

### 2.4 Documentation (docs.yml)

Builds and deploys Docusaurus documentation.

**Triggers:**
- Push to main (deploys latest)
- Manual dispatch

**Jobs:**
- `build-docs` - Build Docusaurus site
- `deploy-docs` - Deploy to GitHub Pages

### 2.5 Dependency Review (dependency-review.yml)

Scans dependencies for vulnerabilities.

**Triggers:**
- Every PR
- Weekly schedule

## 3. Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| NODE_AUTH_TOKEN | npm publishing token | Release |
| PYPI_TOKEN | PyPI publishing token | Release |
| GO_PAT | Go proxy token | Release |
| CODECOV_TOKEN | Codecov upload token | CI |

## 4. Secrets

| Secret | Description |
|--------|-------------|
| NPM_TOKEN | npmjs.com access token |
| PYPI_TOKEN | PyPI access token |
| GO_PAT | GitHub personal access token for Go module publishing |

## 5. Build Matrix

### 5.1 TypeScript SDK

```yaml
node-version: [18.x, 20.x, 22.x]
```

### 5.2 Python SDK

```yaml
python-version: [3.10, 3.11, 3.12]
```

### 5.3 Go SDK

```yaml
go-version: ['1.21', '1.22']
```

## 6. Workflow Locations

- `.github/workflows/ci.yml`
- `.github/workflows/conformance.yml`
- `.github/workflows/release.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/dependency-review.yml`

## 7. Release Process

1. Create release branch from main
2. Update version using release workflow
3. CI pipeline validates all tests pass
4. Release workflow publishes packages
5. Documentation deployed automatically
6. GitHub Release created with changelog