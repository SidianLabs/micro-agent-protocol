# Roadmap

This document outlines the development roadmap for MAP Protocol.

## v1.0 (Current Alpha)

### What's Implemented

The v1.0 release includes the core protocol foundation:

- **Protocol Types**: Complete TypeScript type system for all protocol objects
- **HTTP Transport**: RESTful binding based on OpenAPI 3.1
- **Reference Implementation**: TypeScript reference server
- **Policy Engine**: Default policy engine with common rules
- **Multi-language SDKs**: TypeScript, Python, Go SDKs (preview)
- **Conformance Suite**: Protocol validation tests
- **Deployment Profiles**: Open, Verified, and Regulated profiles

### Implemented Features

| Feature | Status | Notes |
|---------|--------|-------|
| Task Dispatch | ✅ Complete | POST /dispatch |
| Approval Workflow | ✅ Complete | POST /approve |
| Task Retrieval | ✅ Complete | GET /tasks, GET /tasks/{id} |
| Receipt Storage | ✅ Complete | GET /receipts |
| Agent Registry | ✅ Complete | GET /agents, GET /agents/{id} |
| Signed Requests (HMAC) | ✅ Complete | HS256 signing |
| Signed Requests (RSA) | ✅ Complete | RS256 signing |
| Delegation Tokens | ✅ Complete | JWT-like token format |
| Execution Receipts | ✅ Complete | Cryptographically signed |
| Audit Events | ✅ Complete | GET /audit-events |
| Health Checks | ✅ Complete | /health, /ready, /status |
| Async Queue | ✅ Complete | With retry and dead letter |
| SSE Streaming | ✅ Complete | GET /tasks/{id}/stream |

### Known Limitations

The following are known limitations in v1.0:

- **Python SDK**: Preview status, not fully aligned with HTTP contract
- **Go SDK**: Preview status, not fully aligned with HTTP contract
- **Schema Versioning**: Basic support, not all edge cases covered
- **Batch Execution**: Limited support via `batch` execution mode
- **WebSocket Transport**: Not yet implemented
- **GraphQL Binding**: Not yet implemented
- **gRPC Binding**: Not yet implemented
- **HSM Integration**: Interface defined but no production implementation
- **Multi-region Deployment**: No built-in support

---

## v1.1 Planned

Target: Q2 2025

### WebSocket Support

Real-time bidirectional communication for:
- Task status streaming without SSE
- Push notifications for approval required
- Real-time agent discovery updates

```typescript
// Planned WebSocket API
const ws = new WebSocket('wss://api.map-protocol.dev/v1/ws');

// Subscribe to task updates
ws.send(JSON.stringify({
  type: 'subscribe',
  topic: 'task:task_123'
}));

// Receive updates
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(update.status); // 'running', 'completed', etc.
};
```

### Batch Execution

Enhanced batch processing capabilities:
- Batch dispatch of multiple tasks
- Batch approval for multiple requests
- Parallel execution with result aggregation

```typescript
// Planned batch dispatch
const batchRequest = {
  batch_id: 'batch_001',
  tasks: [
    { capability: 'db.read', envelope: {...} },
    { capability: 'db.read', envelope: {...} },
    { capability: 'db.read', envelope: {...} }
  ],
  options: {
    parallel: true,
    stop_on_error: false
  }
};
```

### Enhanced Policy DSL

More expressive policy configuration:
- Rich condition syntax with AND/OR/NOT operators
- External policy evaluation hooks
- Policy test framework

```typescript
// Planned enhanced DSL
const policy = {
  rules: [
    {
      id: 'high_value_approval',
      when: {
        and: [
          { domain: 'payments' },
          { max_amount: { gt: 1000 } }
        ]
      },
      then: 'require_approval',
      reason: 'High-value payments require approval'
    }
  ]
};
```

### Python SDK Completion

Full alignment with HTTP contract:
- Complete error handling parity
- Full async support
- Complete test coverage
- PyPI release

### Go SDK Completion

Full alignment with HTTP contract:
- Complete error handling parity
- Context propagation
- Complete test coverage
- Module release

---

## v2.0 Future

Target: Q4 2025

### Multi-Region Deployment

Geographic distribution and fault tolerance:
- Regional task routing
- Cross-region receipt verification
- Distributed audit chains
- Geo-redundant storage

### GraphQL Binding

Alternative API access:
- Schema-first API design
- Flexible querying
- Real-time subscriptions
- Automatic documentation

```graphql
# Planned GraphQL schema
type Query {
  task(taskId: ID!): Task
  tasks(filter: TaskFilter, limit: Int, cursor: String): TaskConnection
  agent(agentId: ID!): Agent
  agents(filter: AgentFilter): AgentConnection
}

type Mutation {
  dispatch(input: DispatchInput!): DispatchResult
  approve(input: ApprovalInput!): ApprovalResult
}

type Subscription {
  taskUpdated(taskId: ID!): Task
  approvalRequired: Task
}
```

### gRPC Binding

High-performance alternative transport:
- Protocol Buffers schema
- Streaming support
- Connection multiplexing
- Circuit breaker patterns

### Advanced HSM Integration

Production-grade key management:
- AWS KMS provider
- Azure Key Vault provider
- HashiCorp Vault provider
- Automatic key rotation with HSM

### Policy Evaluation API

External policy engine integration:
- Policy service interface
- Remote policy evaluation
- Policy versioning
- Policy audit trail

### Observability Enhancements

Advanced monitoring and tracing:
- OpenTelemetry integration
- Distributed tracing
- Custom metrics
- Alerting rules library

---

## Version History

### v0.9 (Preview)

- Initial public preview
- Core protocol design finalized
- Basic SDK implementations

### v1.0-alpha (Current)

- Protocol types finalized
- HTTP binding complete
- Reference implementation
- Conformance test suite
- Deployment profiles

---

## Contributing to Roadmap

The roadmap is developed based on:

1. **Community Feedback**: GitHub Discussions and Issues
2. **Use Cases**: Real-world deployment requirements
3. **Technical Debt**: Improvements to existing code
4. **Ecosystem**: SDK and tool integration requests

To influence the roadmap:

- Participate in [GitHub Discussions](https://github.com/mapprotocol/map/discussions)
- File issues with the `feature-request` template
- Contribute to existing issues and PRs
- Share your use case requirements

---

## Support Timeline

| Version | Status | Support Until |
|---------|--------|---------------|
| v0.9 | Deprecated | - |
| v1.0-alpha | Active | v2.0 release |
| v1.1 | Planned | TBD |
| v2.0 | Planned | TBD |

---

## Next Steps

- [Quick Start Guide](./quick-start.md) - Get started with MAP Protocol
- [SDK Guide](./sdk-guide.md) - Client integration
- [Protocol Specification](./protocol-spec.md) - Complete protocol reference
- [Deployment Guide](./deployment.md) - Production deployment
- [Security Guide](./security-guide.md) - Security configuration
