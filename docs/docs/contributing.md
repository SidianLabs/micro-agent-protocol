<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Contributing to MAP Protocol

Thank you for your interest in contributing to MAP Protocol!

MAP (Micro Agent Protocol) is an open protocol for deploying policy-aware
micro-agents between external AI assistants and sensitive internal systems.
We welcome contributions from developers, researchers, and organizations.

## Quick Links

- [Code of Conduct](https://github.com/SidianLabs/micro-agent-protocol/blob/main/CODE_OF_CONDUCT.md)
- [Security Policy](https://github.com/SidianLabs/micro-agent-protocol/blob/main/SECURITY.md)
- [GitHub Discussions](https://github.com/SidianLabs/micro-agent-protocol/discussions)
- [Issues](https://github.com/SidianLabs/micro-agent-protocol/issues)

## Ways to Contribute

- **Report Bugs**: File an issue with the `bug` template
- **Suggest Features**: Open a Discussion or file an issue with the `feature` template
- **Write Code**: Submit a pull request
- **Improve Documentation**: Submit documentation improvements
- **Review Code**: Comment on pull requests
- **Test Implementations**: Help us test cross-SDK compatibility
- **Share Feedback**: Participate in GitHub Discussions

## Development Setup

### Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 18+ | For TypeScript SDK and reference |
| Python | 3.9+ | For Python SDK |
| Go | 1.21+ | For Go SDK |
| Docker | 24+ | For running tests |
| Git | 2.40+ | For version control |

### Clone the Repository

```bash
git clone https://github.com/SidianLabs/micro-agent-protocol.git
cd map
```

### Install Dependencies

```bash
# Install all workspace dependencies
npm ci

# Build all packages
npm run build
```

### Run Tests

```bash
# Run all tests
npm test

# Run conformance suites
npm run conformance:all

# Run specific SDK tests
cd packages/typescript && npm test
cd ../python && pytest
cd ../go && go test ./...
```

## Repository Structure

```
MAP/docs/contributing.md#L1-50
map/
├── packages/
│   ├── typescript/          # @sidianlabs/map (npm)
│   ├── python/              # mapprotocol (PyPI)
│   └── go/                  # github.com/SidianLabs/micro-agent-protocol/packages/go/mapproto
├── reference/               # TypeScript reference implementation
│   ├── src/
│   │   ├── control-plane/   # Control plane components
│   │   │   ├── async-queue.ts
│   │   │   ├── delegation.ts
│   │   │   ├── orchestrator.ts
│   │   │   ├── policy.ts
│   │   │   ├── receipt-store.ts
│   │   │   ├── registry.ts
│   │   │   └── task-store.ts
│   │   ├── runtime/          # Micro-agent runtime
│   │   │   ├── generic-agent.ts
│   │   │   ├── micro-agent.ts
│   │   │   └── example-agents.ts
│   │   ├── security/        # Security components
│   │   │   ├── key-provider.ts
│   │   │   └── signing.ts
│   │   └── server/          # HTTP server
│   │       ├── admin-routes.ts
│   │       ├── auth.ts
│   │       ├── http.ts
│   │       └── mutation-routes.ts
│   └── test/
├── schemas/                 # JSON Schemas & OpenAPI spec
│   ├── openapi.yaml        # OpenAPI 3.1 specification
│   └── *.schema.json       # Protocol schemas
├── docs/                   # Documentation
├── conformance/            # Conformance test suites
│   ├── typescript/
│   ├── python/
│   └── go/
└── examples/               # Example agents and requests
```

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Repository Architecture                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │  packages/  │    │   schemas/  │    │    docs/    │    │
│  │  (SDKs)     │    │  (Spec)     │    │  (Docs)     │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│          │                │                  │              │
│          ▼                ▼                  ▼              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                    reference/                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │control-plane│  │   runtime/  │  │   server/   │  │  │
│  │  │  Registry   │  │  MicroAgent │  │   HTTP API  │  │  │
│  │  │  Policy     │  │  PaymentAge │  │   Auth      │  │  │
│  │  │  TaskStore  │  │  DBReadAge  │  │  Routes     │  │  │
│  │  │  ReceiptSto │  │             │  │             │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                               │
│                           ▼                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                   conformance/                        │  │
│  │  typescript/    python/    go/    reference/         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Coding Standards

### TypeScript/JavaScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer `const` over `let`, never use `var`
- Use named exports over default exports
- Add JSDoc comments for all public APIs
- Run `npm run lint` before committing

```typescript
MAP/CONTRIBUTING.md#L70-90
/**
 * Dispatches a task to a micro-agent for execution.
 *
 * @param request - The dispatch request containing the task envelope
 * @param options - Optional dispatch configuration
 * @returns The execution result and receipt
 * @throws {MapAPIError} When dispatch fails
 */
export async function dispatch(
  request: DispatchRequest,
  options?: DispatchOptions
): Promise<InvokeResult> {
  // implementation
}
```

### Python

- Follow [PEP 8](https://pep8.org/)
- Use type hints for all function signatures
- Use `black` for code formatting
- Use `ruff` for linting
- Add docstrings to all public functions

```python
MAP/CONTRIBUTING.md#L100-120
def dispatch(
    request: DispatchRequest,
    options: Optional[DispatchOptions] = None
) -> InvokeResult:
    """
    Dispatches a task to a micro-agent for execution.

    Args:
        request: The dispatch request containing the task envelope.
        options: Optional dispatch configuration.

    Returns:
        The execution result and receipt.

    Raises:
        MapAPIError: When dispatch fails.
    """
    pass
```

### Go

- Follow [Effective Go](https://go.dev/doc/effective_go)
- Use `gofmt` for formatting
- Use `go vet` and `golangci-lint` for linting
- Add comprehensive tests using `testing` package
- Document all exported functions

```go
MAP/CONTRIBUTING.md#L130-150
// Dispatch sends a task to a micro-agent for execution.
//
// It takes a context for cancellation and a dispatch request containing
// the task envelope. Returns the execution result and receipt, or an
// error if the dispatch fails.
func (c *Client) Dispatch(ctx context.Context, req *DispatchRequest) (*InvokeResult, error) {
    // implementation
}
```

## Pull Request Process

### 1. Fork and Create Branch

```bash
# Create a feature branch
git checkout -b feature/my-new-feature

# Or a bug fix branch
git checkout -b fix/issue-description
```

Branch naming conventions:

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/*` | `feature/payment-capability` |
| Bug Fix | `fix/*` | `fix/token-validation-bug` |
| Documentation | `docs/*` | `docs/quickstart-improvements` |
| Refactor | `refactor/*` | `refactor/error-handling` |

### 2. Make Your Changes

- Write code following the coding standards above
- Add tests for new functionality
- Update documentation as needed
- Run linting and formatting

```bash
# TypeScript
npm run lint
npm run format

# Python
ruff check .
black .

# Go
golangci-lint run
gofmt -s -w .
```

### 3. Commit Your Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `revert`

Examples:

```bash
git commit -m "feat(sdk): add support for async task polling"
git commit -m "fix(orchestrator): correct token expiry validation"
git commit -m "docs: update quickstart guide with new example"
git commit -m "test(python): add conformance tests for signing"
```

### 4. Push and Create PR

```bash
git push origin feature/my-new-feature
```

Then open a Pull Request on GitHub.

### 5. Pull Request Checklist

Before submitting, ensure:

- [ ] Code follows the style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated and passing
- [ ] Documentation updated (if applicable)
- [ ] CHANGELOG.md updated (if applicable)
- [ ] No console.log/debug statements
- [ ] No sensitive data (keys, secrets, passwords)
- [ ] Commit messages are descriptive

### 6. Review Process

- Maintainers will review within 48 hours
- Address any feedback promptly
- Once approved, a maintainer will merge
- The PR will be squashed and merged

## Testing Strategies

### Unit Testing

```typescript
// Example: Testing the policy engine
describe('DefaultPolicyEngine', () => {
  it('should allow low-risk tasks', () => {
    const context = createPolicyContext({ risk_level: 'low' });
    const decision = engine.evaluate(context);
    expect(decision.allowed).toBe(true);
  });

  it('should deny payments to non-approved vendors', () => {
    const context = createPolicyContext({
      domain: 'payments',
      constraints: { domain: { approved_vendor_only: false } }
    });
    const decision = engine.evaluate(context);
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe('deny');
  });
});
```

### Integration Testing

```typescript
// Example: Testing dispatch flow
describe('Dispatch Integration', () => {
  it('should complete payment task', async () => {
    const response = await fetch('/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createPaymentRequest())
    });

    const result = await response.json();
    expect(result.ok).toBe(true);
    expect(result.data.result.status).toBe('completed');
  });
});
```

### Conformance Testing

```bash
# Run protocol conformance tests
npm run conformance:reference

# Run deployment profile tests
npm run conformance:profiles

# Run trust chain tests
npm run conformance:trust

# Run all conformance suites
npm run conformance:all
```

## Testing Requirements

| SDK | Test Command | Coverage Target |
|-----|-------------|----------------|
| TypeScript | `npm test` | >80% |
| Python | `pytest` | >80% |
| Go | `go test ./...` | >80% |

All tests must pass before merging, including conformance suites.

## Conformance Requirements

All SDKs must pass the conformance test suite:

```bash
# Run all conformance suites
npm run conformance:all

# Individual suites
npm run conformance:reference
npm run conformance:profiles
npm run conformance:trust
```

### Conformance Test Categories

| Suite | Description |
|-------|-------------|
| `reference` | Core protocol behavior |
| `profiles` | Deployment profile compliance |
| `trust` | Trust chain and signatures |
| `fixtures` | Deterministic signature fixtures |
| `errors` | Error taxonomy |
| `contract` | API contract |
| `api-surface` | Pagination and ETag |

## Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- `MAJOR.MINOR.PATCH` (e.g., 1.2.3)
- Pre-release: `MAJOR.MINOR.PATCH-alpha.1`

### Release Steps

1. Update `CHANGELOG.md` with changes since last release
2. Update version in `package.json` files
3. Create release commit with tag
4. Push tag to trigger release
5. GitHub Actions publishes packages

```bash
# Example release
git checkout main
git pull origin main
npm version minor  # Bumps 1.2.3 -> 1.3.0
git push origin main
git push origin v1.3.0
```

## Commit Signing

We recommend signing your commits. This verifies your authorship.

```bash
# Configure git to always sign commits
git config --global commit.gpgsign true

# Or sign just this commit
git commit -S -m "your commit message"
```

## License

By contributing to MAP Protocol, you agree that your contributions will be
licensed under the Apache License, Version 2.0. See the
[LICENSE](https://github.com/SidianLabs/micro-agent-protocol/blob/main/LICENSE)
file for details.

## Recognition

Contributors who submit accepted changes will be recognized:

1. **All Contributors** listed in our README
2. **Release Notes** credit for significant contributions
3. **GitHub Profile** linked in commit history

## Resources

- [MAP Protocol Website](https://map-protocol.dev)
- [Documentation](https://map-protocol.dev/docs)
- [Protocol Specification](./protocol-spec.md)
- [OpenAPI Specification](https://github.com/SidianLabs/micro-agent-protocol/blob/main/schemas/openapi.yaml)
- [GitHub Discussions](https://github.com/SidianLabs/micro-agent-protocol/discussions)
- [Issues](https://github.com/SidianLabs/micro-agent-protocol/issues)

## Questions?

- **General Questions**: [GitHub Discussions](https://github.com/SidianLabs/micro-agent-protocol/discussions)
- **Security Issues**: See [SECURITY.md](https://github.com/SidianLabs/micro-agent-protocol/blob/main/SECURITY.md)
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](https://github.com/SidianLabs/micro-agent-protocol/blob/main/CODE_OF_CONDUCT.md)
- **Email**: maintainers@map-protocol.dev

---

Thank you for contributing to MAP Protocol!
