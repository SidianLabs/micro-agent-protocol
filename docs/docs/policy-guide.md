<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# Policy Configuration Guide

This guide covers configuring and customizing the MAP Policy Engine for your organization's requirements.

## Policy Engine

### Overview

The MAP Policy Engine evaluates incoming task requests against defined rules to determine whether execution should be allowed, denied, or require approval.

```typescript
MAP/src/src/control-plane/policy.ts#L14-22
export interface PolicyContext {
  descriptor: AgentDescriptor;
  envelope: TaskEnvelope;
}

export interface PolicyEngine {
  evaluate(context: PolicyContext): PolicyDecision;
}
```

### Default Policy Engine

The reference implementation includes a `DefaultPolicyEngine` that handles common scenarios:

```typescript
MAP/src/src/control-plane/policy.ts#L24-72
export class DefaultPolicyEngine implements PolicyEngine {
  constructor(private readonly options: DefaultPolicyEngineOptions = {}) {}

  evaluate({ descriptor, envelope }: PolicyContext): PolicyDecision {
    const common = (envelope.constraints.common ?? {}) as Record<string, unknown>;
    const domain = (envelope.constraints.domain ?? {}) as Record<string, unknown>;
    const maxAmount = Number(common.max_amount ?? 0);
    const approvedVendorOnly = domain.approved_vendor_only === true;
    const environment = String(common.environment ?? "");
    const tenantId = String(envelope.requester_identity.tenant_id ?? "").trim();

    // Tenant requirement check
    if (this.options.requireTenant && tenantId.length === 0) {
      return {
        allowed: false,
        action: "deny",
        policy_checks: ["tenant_id_required"],
        reason: "Requester tenant_id is required by policy."
      };
    }

    // Critical capabilities always require approval
    if (descriptor.risk_level === "critical") {
      return {
        allowed: false,
        action: "require_approval",
        policy_checks: ["critical_capability_requires_approval"],
        reason: "Critical capabilities always require approval."
      };
    }

    // Payments must target approved vendors
    if (descriptor.domain === "payments" && !approvedVendorOnly) {
      return {
        allowed: false,
        action: "deny",
        policy_checks: ["approved_vendor_required"],
        reason: "Payments must target approved vendors."
      };
    }

    // Payment amount threshold check
    if (descriptor.domain === "payments" && maxAmount > 1000) {
      return {
        allowed: false,
        action: "require_approval",
        policy_checks: ["payment_threshold_exceeded"],
        reason: "Payment amount exceeds auto-approval threshold."
      };
    }

    // Production database reads require approval
    if (descriptor.domain === "database" && environment === "production") {
      return {
        allowed: false,
        action: "require_approval",
        policy_checks: ["production_data_requires_approval"],
        reason: "Production database reads require approval."
      };
    }

    return {
      allowed: true,
      action: "allow",
      policy_checks: ["policy_passed"],
      scoped_constraints: envelope.constraints
    };
  }
}
```

### Policy Decision Actions

| Action | Description | Next Step |
|--------|-------------|-----------|
| `allow` | Task can proceed immediately | Execute task |
| `deny` | Task is rejected | Return error to requester |
| `require_approval` | Task requires human approval | Await approval via `/approve` |

---

## Writing Policies

### Policy Structure

Policies are evaluated based on:

1. **Requester Identity**: Type (user/service/agent), ID, tenant
2. **Task Constraints**: Common and domain-specific constraints
3. **Agent Descriptor**: Risk level, domain, capabilities
4. **Environment**: development, staging, production

### Custom Policy Example

Create a custom policy engine:

```typescript
import type { PolicyEngine, PolicyContext, PolicyDecision } from '@sidianlabs/map-client';

export class CustomPolicyEngine implements PolicyEngine {
  private readonly approvalThreshold: number;
  private readonly allowedEnvironments: string[];
  private readonly requireVendorApproval: boolean;

  constructor(options: {
    approvalThreshold?: number;
    allowedEnvironments?: string[];
    requireVendorApproval?: boolean;
  } = {}) {
    this.approvalThreshold = options.approvalThreshold ?? 5000;
    this.allowedEnvironments = options.allowedEnvironments ?? ['staging', 'production'];
    this.requireVendorApproval = options.requireVendorApproval ?? true;
  }

  evaluate({ descriptor, envelope }: PolicyContext): PolicyDecision {
    const checks: string[] = [];
    
    // Check environment
    const env = String(envelope.constraints.common?.environment ?? '');
    if (!this.allowedEnvironments.includes(env)) {
      return {
        allowed: false,
        action: 'deny',
        policy_checks: [...checks, 'environment_not_allowed'],
        reason: `Environment '${env}' is not allowed by policy.`
      };
    }
    checks.push('environment_allowed');

    // Check amount threshold
    const amount = Number(envelope.constraints.common?.max_amount ?? 0);
    if (amount > this.approvalThreshold) {
      return {
        allowed: false,
        action: 'require_approval',
        policy_checks: [...checks, 'amount_exceeds_threshold'],
        reason: `Amount ${amount} exceeds auto-approval threshold ${this.approvalThreshold}.`
      };
    }
    checks.push('amount_within_threshold');

    // Check vendor approval requirement
    if (this.requireVendorApproval && descriptor.domain === 'payments') {
      const vendorApproved = envelope.constraints.domain?.approved_vendor_only === true;
      if (!vendorApproved) {
        return {
          allowed: false,
          action: 'deny',
          policy_checks: [...checks, 'vendor_not_approved'],
          reason: 'Payments must be to approved vendors only.'
        };
      }
      checks.push('vendor_approved');
    }

    return {
      allowed: true,
      action: 'allow',
      policy_checks: checks,
      scoped_constraints: envelope.constraints
    };
  }
}
```

### Policy DSL Syntax

Policies use a domain-specific language for expressing rules:

```
RULE payment_threshold
  WHEN domain = "payments" AND max_amount > 1000
  THEN REQUIRE_APPROVAL
  REASON "High-value payments require approval"

RULE vendor_approval
  WHEN domain = "payments" AND approved_vendor_only = false
  THEN DENY
  REASON "Only approved vendors allowed"

RULE production_database
  WHEN domain = "database" AND environment = "production"
  THEN REQUIRE_APPROVAL
  REASON "Production database access requires approval"

RULE critical_capability
  WHEN risk_level = "critical"
  THEN REQUIRE_APPROVAL
  REASON "Critical capabilities require approval"
```

### Rule Examples

#### Amount-Based Approval

```json
{
  "rule": "high_value_approval",
  "condition": {
    "domain": "payments",
    "max_amount": { "$gt": 5000 }
  },
  "action": "require_approval",
  "reason": "Payments over 5000 require human approval"
}
```

#### Environment Restrictions

```json
{
  "rule": "production_restriction",
  "condition": {
    "environment": "production",
    "domain": "database"
  },
  "action": "require_approval",
  "reason": "Production database operations require approval"
}
```

#### Vendor Validation

```json
{
  "rule": "vendor_validation",
  "condition": {
    "domain": "payments",
    "approved_vendor_only": false
  },
  "action": "deny",
  "reason": "Only approved vendors may receive payments"
}
```

---

## Per-Domain Policies

### Payments Domain

Payment policies enforce:

- Vendor approval requirements
- Amount thresholds
- Currency restrictions
- Time window constraints

```typescript
const paymentPolicy = {
  rules: [
    {
      id: 'vendor_required',
      condition: { domain: 'payments', 'domain.approved_vendor_only': false },
      action: 'deny',
      reason: 'Payments must target approved vendors'
    },
    {
      id: 'amount_threshold',
      condition: { domain: 'payments', 'common.max_amount': { $gt: 1000 } },
      action: 'require_approval',
      reason: 'Payment amount exceeds auto-approval threshold'
    },
    {
      id: 'critical_approval',
      condition: { 'descriptor.risk_level': 'critical' },
      action: 'require_approval',
      reason: 'Critical risk operations require approval'
    }
  ]
};
```

### Databases Domain

Database policies enforce:

- Environment restrictions
- Query type limitations
- Data classification
- Row-level limits

```typescript
const databasePolicy = {
  rules: [
    {
      id: 'production_approval',
      condition: { domain: 'database', 'common.environment': 'production' },
      action: 'require_approval',
      reason: 'Production database access requires approval'
    },
    {
      id: 'read_only',
      condition: { domain: 'database', 'descriptor.execution_mode': 'commit' },
      action: 'deny',
      reason: 'Write operations not allowed via MAP'
    },
    {
      id: 'row_limit',
      condition: { domain: 'database', 'common.limit': { $gt: 100 } },
      action: 'require_approval',
      reason: 'Large result sets require approval'
    }
  ]
};
```

### Enterprise Systems Domain

Enterprise system policies enforce:

- System-specific access controls
- Integration approvals
- Data residency requirements

```typescript
const enterprisePolicy = {
  rules: [
    {
      id: 'crm_production',
      condition: { domain: 'crm', 'common.environment': 'production' },
      action: 'require_approval',
      reason: 'Production CRM operations require approval'
    },
    {
      id: 'erp_write',
      condition: { domain: 'erp', 'descriptor.execution_mode': 'commit' },
      action: 'require_approval',
      reason: 'ERP write operations require approval'
    },
    {
      id: 'document_restricted',
      condition: { domain: 'documents', 'domain.classification': 'restricted' },
      action: 'require_approval',
      reason: 'Restricted documents require approval'
    }
  ]
};
```

---

## Testing Policies

### Unit Testing Policies

```typescript
import { DefaultPolicyEngine } from './policy';
import type { PolicyContext } from './policy';

describe('DefaultPolicyEngine', () => {
  let engine: DefaultPolicyEngine;

  beforeEach(() => {
    engine = new DefaultPolicyEngine({ requireTenant: true });
  });

  it('should allow low-risk tasks', () => {
    const context: PolicyContext = {
      descriptor: {
        agent_id: 'test-agent',
        organization: 'test',
        version: '1.0.0',
        domain: 'database',
        capabilities: ['db.read'],
        risk_level: 'low',
        input_schema_ref: 'test',
        output_schema_ref: 'test',
        supported_execution_modes: ['read'],
        visibility_modes: ['full']
      },
      envelope: {
        task_id: 'test-1',
        requester_identity: { type: 'user', id: 'user1', tenant_id: 'tenant1' },
        target_agent: 'test-agent',
        intent: 'Read data',
        constraints: { common: { environment: 'staging' } },
        risk_class: 'low',
        delegation_token: 'token',
        requested_output_mode: 'full'
      }
    };

    const decision = engine.evaluate(context);
    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe('allow');
  });

  it('should deny when tenant is required but missing', () => {
    const context: PolicyContext = {
      descriptor: { /* ... */ } as any,
      envelope: {
        task_id: 'test-2',
        requester_identity: { type: 'user', id: 'user1' }, // No tenant_id
        target_agent: 'test-agent',
        intent: 'Read data',
        constraints: {},
        risk_class: 'low',
        delegation_token: 'token',
        requested_output_mode: 'full'
      }
    };

    const decision = engine.evaluate(context);
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe('deny');
    expect(decision.policy_checks).toContain('tenant_id_required');
  });

  it('should require approval for high-value payments', () => {
    const context: PolicyContext = {
      descriptor: {
        agent_id: 'payment-agent',
        organization: 'test',
        version: '1.0.0',
        domain: 'payments',
        capabilities: ['payment.execute'],
        risk_level: 'high',
        input_schema_ref: 'test',
        output_schema_ref: 'test',
        supported_execution_modes: ['commit'],
        visibility_modes: ['summary']
      },
      envelope: {
        task_id: 'test-3',
        requester_identity: { type: 'user', id: 'user1', tenant_id: 'tenant1' },
        target_agent: 'payment-agent',
        intent: 'Process payment',
        constraints: {
          common: { max_amount: 5000, approved_vendor_only: true }
        },
        risk_class: 'high',
        delegation_token: 'token',
        requested_output_mode: 'summary'
      }
    };

    const decision = engine.evaluate(context);
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe('require_approval');
    expect(decision.policy_checks).toContain('payment_threshold_exceeded');
  });
});
```

### Policy Test Patterns

```typescript
// Test deny patterns
const denyCases = [
  { domain: 'payments', approved_vendor_only: false, expect: 'deny' },
  { domain: 'payments', max_amount: 5000, environment: 'production', expect: 'deny' },
  { tenant_id: '', requireTenant: true, expect: 'deny' }
];

// Test approval-required patterns
const approvalCases = [
  { domain: 'payments', max_amount: 1500, expect: 'require_approval' },
  { domain: 'database', environment: 'production', expect: 'require_approval' },
  { risk_level: 'critical', expect: 'require_approval' }
];

// Test allow patterns
const allowCases = [
  { domain: 'database', environment: 'staging', max_amount: 500, expect: 'allow' },
  { domain: 'payments', max_amount: 500, approved_vendor_only: true, expect: 'allow' }
];
```

---

## Next Steps

- [Security Guide](./security-guide.md) - Authentication and trust
- [Deployment Guide](./deployment.md) - Production deployment
- [Protocol Specification](./protocol-spec.md) - Complete protocol reference
