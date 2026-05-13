# PAD-01: Project Overview, Vision & Success Criteria

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Project Overview

### 1.1 What is MAP Protocol?

MAP (Micro Agent Protocol) is an open standard for AI assistant-to-micro-agent delegation with policy enforcement. It enables organizations to deploy small, policy-controlled micro-agents between external AI assistants and sensitive systems.

### 1.2 Core Thesis

Modern agent systems are missing a middle layer. Today, the usual choices are:
- Raw tools exposed through protocols like MCP
- Heavyweight peer-agent communication models like A2A

MAP introduces a third model: small, capability-scoped micro-agents deployed by the company that owns the system.

Instead of: `assistant -> raw tool`

MAP uses: `assistant -> company MAP micro-agent -> local system`

### 1.3 Why MAP Exists

MAP solves three linked problems in production agent systems:
1. **Context overload** - Assistants receive too much raw schema, trace, and system output
2. **Over-centralized authority** - Assistants end up with direct access to dangerous capabilities
3. **Weak trust boundaries** - Sensitive execution is simple tool calls instead of policy-aware decisions

## 2. Vision

### 2.1 Long-term Vision

MAP aims to become the standard protocol for secure AI agent delegation, enabling:
- Safe delegated execution that is easy to deploy
- Companies maintaining control over their own systems
- Context boundaries that protect sensitive information
- Policy enforcement at the point of execution

### 2.2 Immediate Goals (1.0.0 Release)

1. Establish multi-language SDK ecosystem (TypeScript, Python, Go)
2. Define clear protocol specification with OpenAPI 3.1
3. Build conformance test suite for protocol validation
4. Create documentation for adoption

## 3. Success Criteria

### 3.1 Technical Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| SDK Test Coverage | >80% | Line coverage |
| Conformance Pass Rate | 100% | All protocol tests pass |
| Documentation Coverage | Complete | All endpoints documented |
| Build Success Rate | 100% | CI pipeline green |

### 3.2 Community Success Criteria

| Metric | Target | Timeline |
|--------|--------|----------|
| GitHub Stars | >100 | 3 months |
| NPM Downloads | >1000/month | 6 months |
| Contributors | >10 | 6 months |
| SDK Adoption | 5+ projects | 6 months |

### 3.3 Quality Gates

- [ ] All TypeScript SDK tests passing
- [ ] All Python SDK tests passing
- [ ] All Go SDK tests passing
- [ ] Schema conformance tests passing
- [ ] Docusaurus documentation builds successfully
- [ ] GitHub Actions CI pipeline passing
- [ ] No critical security vulnerabilities

## 4. Scope

### 4.1 In Scope (1.0.0)

- TypeScript SDK (@mapprotocol/sdk)
- Python SDK (mapprotocol)
- Go SDK (github.com/mapprotocol/map/packages/go/mapproto)
- OpenAPI 3.1 Specification
- Conformance Test Suite
- Basic Documentation
- Apache 2.0 License

### 4.2 Out of Scope (Future)

- WebSocket transport binding
- Rust SDK
- Java SDK
- Advanced policy engine features
- Enterprise features (SSO, audit dashboards)
- Managed cloud service

## 5. Release Version

**Version:** 1.0.0-alpha.1  
**Release Type:** Alpha (public preview)  
**Expected Timeline:** 24 weeks (3-6 months)

## 6. Stakeholders

### 6.1 Project Maintainers

MAP Protocol is maintained by the MAP Protocol Authors (see MAINTAINERS.md).

### 6.2 Contributors

External contributions welcome. See CONTRIBUTING.md for guidelines.

### 6.3 Users

- AI assistant developers integrating MAP
- Organizations deploying micro-agents
- SDK developers building on the protocol