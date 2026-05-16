import type { AgentDescriptor, PolicyDecision, TaskEnvelope } from "../types.js";

export interface PolicyContext {
  descriptor: AgentDescriptor;
  envelope: TaskEnvelope;
}

export interface PolicyEngine {
  evaluate(context: PolicyContext): PolicyDecision;
}

export interface DefaultPolicyEngineOptions {
  requireTenant?: boolean;
}

export class DefaultPolicyEngine implements PolicyEngine {
  constructor(private readonly options: DefaultPolicyEngineOptions = {}) {}

  evaluate({ descriptor, envelope }: PolicyContext): PolicyDecision {
    const common = (envelope.constraints.common ?? {}) as Record<string, unknown>;
    const domain = (envelope.constraints.domain ?? {}) as Record<string, unknown>;
    const maxAmount = Number(common.max_amount ?? 0);
    const approvedVendorOnly = domain.approved_vendor_only === true;
    const environment = String(common.environment ?? "");
    const tenantId = String(envelope.requester_identity.tenant_id ?? "").trim();

    if (this.options.requireTenant && tenantId.length === 0) {
      return {
        allowed: false,
        action: "deny",
        policy_checks: ["tenant_id_required"],
        reason: "Requester tenant_id is required by policy."
      };
    }

    if (descriptor.risk_level === "critical") {
      return {
        allowed: false,
        action: "require_approval",
        policy_checks: ["critical_capability_requires_approval"],
        reason: "Critical capabilities always require approval."
      };
    }

    if (descriptor.domain === "payments" && !approvedVendorOnly) {
      return {
        allowed: false,
        action: "deny",
        policy_checks: ["approved_vendor_required"],
        reason: "Payments must target approved vendors."
      };
    }

    if (descriptor.domain === "payments" && maxAmount > 1000) {
      return {
        allowed: false,
        action: "require_approval",
        policy_checks: ["payment_threshold_exceeded"],
        reason: "Payment amount exceeds auto-approval threshold."
      };
    }

    if (
      descriptor.domain === "database" &&
      environment === "production"
    ) {
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
