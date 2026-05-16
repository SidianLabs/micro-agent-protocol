# Contributing to MAP Protocol

Thank you for your interest in contributing to MAP Protocol!

MAP (Micro Agent Protocol) is an open protocol for deploying policy-aware
micro-agents between external AI assistants and sensitive internal systems.
We welcome contributions from developers, researchers, and organizations.

## Quick Links

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
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
map/
├── packages/
│   ├── typescript/          # @sidianlabs/map-sdk (npm)
│   ├── python/              # @mapprotocol/python (PyPI)
│   └── go/                  # github.com/SidianLabs/micro-agent-protocol
├── reference/               # TypeScript reference implementation
│   ├── src/                # Core implementation
│   └── test/               # Test suite
├── schemas/                 # JSON Schemas & OpenAPI spec
│   ├── openapi.yaml        # OpenAPI 3.1 specification
│   └── *.schema.json       # Protocol schemas
├── docs/                   # Documentation (Docusaurus)
│   └── docs/               # Doc pages
├── conformance/            # Conformance test suites
│   ├── typescript/
│   ├── python/
│   └── go/
└── examples/               # Example agents and requests
```

## Coding Standards

### TypeScript/JavaScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer `const` over `let`, never use `var`
- Use named exports over default exports
- Add JSDoc comments for all public APIs
- Run `npm run lint` before committing

```typescript
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
licensed under the Apache License, Version 2.0. See the [LICENSE](./LICENSE)
file for details.

## Recognition

Contributors who submit accepted changes will be recognized:

1. **All Contributors** listed in our README
2. **Release Notes** credit for significant contributions
3. **GitHub Profile** linked in commit history

## Questions?

- **General Questions**: [GitHub Discussions](https://github.com/SidianLabs/micro-agent-protocol/discussions)
- **Security Issues**: See [SECURITY.md](./SECURITY.md)
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- **Email**: maintainers@map-protocol.dev

## Resources

- [MAP Protocol Website](https://github.com/SidianLabs/micro-agent-protocol)
- [Documentation](https://github.com/SidianLabs/micro-agent-protocol/docs)
- [Protocol Specification](./docs/protocol-core-v1.md)
- [OpenAPI Specification](./schemas/openapi.yaml)

Thank you for contributing to MAP Protocol!
