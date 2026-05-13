# PAD-02: Complete System Architecture & Component Design

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        External Assistant                         │
│         (ChatGPT / Claude / Copilot / Enterprise Agent)         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MAP Boundary                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Control Plane                            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ Registry │ │ Policy   │ │Delegation│ │    Audit     │ │  │
│  │  │          │ │ Engine    │ │ Service  │ │   Receipts   │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ PayPal Agent  │     │   DB Agent    │     │  CRM Agent    │
└───────────────┘     └───────────────┘     └───────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ Payment Rail  │     │   Database    │     │  CRM System   │
└───────────────┘     └───────────────┘     └───────────────┘
```

## 2. Core Components

### 2.1 Control Plane

The control plane manages the lifecycle of delegation requests.

**Components:**
- **Registry**: Agent discovery and capability lookup
- **Policy Engine**: Rule evaluation and constraint validation
- **Delegation Service**: Task dispatch and approval routing
- **Audit Receipts**: Execution logging and compliance

### 2.2 SDK Layer

Multi-language SDKs for assistant integration:

| SDK | Package | Purpose |
|-----|---------|---------|
| TypeScript | @mapprotocol/sdk | Node.js/JavaScript clients |
| Python | mapprotocol | Python clients |
| Go | github.com/mapprotocol/map/packages/go/mapproto | Go clients |

### 2.3 Agent Runtime

Micro-agents execute delegated tasks:

- Policy enforcement before execution
- Local tool access with credentials
- Result filtering and redaction
- Execution receipt generation

## 3. Data Flow

### 3.1 Task Dispatch Flow

```
1. Assistant creates TaskEnvelope
2. Client validates envelope structure
3. Client signs request with HMAC
4. POST /dispatch to Control Plane
5. Control Plane validates delegation token
6. Policy Engine evaluates rules
7. Request routed to target micro-agent
8. Micro-agent executes with policy checks
9. Result filtered per visibility mode
10. Receipt generated and stored
11. Response returned to assistant
```

### 3.2 Approval Flow (High-Risk Tasks)

```
1. Task dispatched with risk_class=high
2. Policy Engine returns CHALLENGE effect
3. Task status set to awaiting_approval
4. Human reviewer notified
5. Reviewer approves or denies via POST /approve
6. If approved, execution proceeds
7. If denied, task marked as denied
```

## 4. Security Model

### 4.1 Trust Boundaries

1. **Assistant → MAP Boundary**: Signed requests required
2. **Control Plane → Micro-Agent**: Internal network only
3. **Micro-Agent → Resource**: Local credentials, no external exposure

### 4.2 Authentication

- HMAC-SHA256 signed requests
- Key ID and timestamp headers
- Request body hashing

### 4.3 Authorization

- Delegation token scopes authority
- Resource scope limits access
- Policy rules evaluated per request

## 5. Component Specifications

### 5.1 Registry

```typescript
interface AgentDescriptor {
  agent_id: string;
  organization: string;
  version: string;
  domain: string;
  capabilities: string[];
  risk_level: RiskLevel;
  input_schema_ref: string;
  output_schema_ref: string;
  transport_bindings: TransportBinding[];
  registry_status: RegistryStatus;
}
```

### 5.2 Policy Engine

```typescript
interface PolicyRule {
  id: string;
  name: string;
  target: PolicyTarget;
  condition?: PolicyCondition;
  effect: PolicyEffect;
  priority: number;
}

enum PolicyEffect {
  ALLOW = 'allow',
  DENY = 'deny',
  CHALLENGE = 'challenge',
}
```

### 5.3 Task Envelope

```typescript
interface TaskEnvelope {
  task_id: string;
  requester_identity: RequesterIdentity;
  target_agent: string;
  intent: string;
  constraints: TaskConstraints;
  risk_class: RiskLevel;
  delegation_token: string;
  requested_output_mode: VisibilityMode;
}
```

## 6. Deployment Profiles

### 6.1 Open Profile

For development and testing:
- No request signing required
- Local agent registry
- Minimal policy rules

### 6.2 Verified Profile

For production:
- HMAC signed requests required
- Remote agent registry
- Full policy enforcement
- Audit logging enabled

### 6.3 Regulated Profile

For compliance environments:
- All verified profile requirements
- Enhanced audit trails
- Mandatory approval workflows
- Data residency enforcement