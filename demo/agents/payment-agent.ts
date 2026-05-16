/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseMicroAgent } from "../../src/runtime/micro-agent.js";
import type {
  AgentDescriptor,
  DelegationToken,
  InvokeResult,
  TaskEnvelope
} from "../../src/types.js";

export class PaymentAgent extends BaseMicroAgent {
  readonly descriptor: AgentDescriptor = {
    agent_id: "payment-agent-v1",
    organization: "example-corp",
    version: "1.0.0",
    domain: "payments",
    capabilities: ["payment.propose", "payment.execute", "payment.refund"],
    risk_level: "high",
    input_schema_ref: "schema://payment-agent/input",
    output_schema_ref: "schema://payment-agent/output",
    supported_execution_modes: ["propose", "commit"],
    approval_requirements: ["threshold_based", "policy_condition"],
    visibility_modes: ["summary", "structured_only", "receipt_only"],
    policy_hooks: ["vendor_approval_check", "budget_limit_check", "invoice_match_check"],
    display_name: "Payment Agent",
    provider_url: "https://example-corp.local/providers/payments",
    documentation_url: "https://example-corp.local/docs/map/payment-agent",
    auth_schemes: ["signed_request"],
    capability_descriptors: [
      {
        name: "payment.propose",
        execution_mode: "propose",
        request_schema_ref: "schema://payment.propose/request",
        response_schema_ref: "schema://payment.propose/response",
        constraint_schema_ref: "schema://payment.propose/constraints",
        approval_required_by_default: false,
        auth_schemes: ["bearer", "signed_request"],
        required_auth_scheme: "signed_request",
        schema_version: "1.0.0",
        supported_schema_versions: ["1.0.0"],
        preferred_schema_version: "1.0.0",
        compatibility: "backward_compatible",
        status: "active"
      },
      {
        name: "payment.execute",
        execution_mode: "commit",
        request_schema_ref: "schema://payment.execute/request",
        response_schema_ref: "schema://payment.execute/response",
        constraint_schema_ref: "schema://payment.execute/constraints",
        approval_required_by_default: false,
        auth_schemes: ["signed_request"],
        required_auth_scheme: "signed_request",
        schema_version: "1.1.0",
        supported_schema_versions: ["1.0.0", "1.1.0"],
        preferred_schema_version: "1.1.0",
        translation_targets: [
          {
            from: "1.0.0",
            to: "1.1.0",
            mode: "provider_translation"
          }
        ],
        compatibility: "backward_compatible",
        status: "active"
      },
      {
        name: "payment.refund",
        execution_mode: "commit",
        request_schema_ref: "schema://payment.refund/request",
        response_schema_ref: "schema://payment.refund/response",
        constraint_schema_ref: "schema://payment.refund/constraints",
        approval_required_by_default: true,
        auth_schemes: ["signed_request"],
        required_auth_scheme: "signed_request",
        schema_version: "2.0.0",
        supported_schema_versions: ["2.0.0"],
        preferred_schema_version: "2.0.0",
        compatibility: "breaking_change",
        status: "active"
      }
    ],
    transport_bindings: [{ kind: "http", endpoint: "https://example-corp.local/map" }],
    tags: ["payments", "checkout", "high-risk"],
    registry_status: "active",
    description: "Example MAP micro-agent for payment execution."
  };

  protected async execute(envelope: TaskEnvelope, token: DelegationToken): Promise<InvokeResult> {
    const common = (envelope.constraints.common ?? {}) as Record<string, unknown>;
    const domain = (envelope.constraints.domain ?? {}) as Record<string, unknown>;
    const vendorId = String(common.resource_id ?? "unknown_vendor");
    const invoiceId = String(domain.invoice_id ?? "unknown_invoice");
    const amount = Number(common.max_amount ?? 0);
    const currency = String(common.currency ?? "USD");

    const result = this.buildResult(
      envelope,
      "completed",
      {
        transaction_id: `txn:${envelope.task_id}`,
        invoice_id: invoiceId,
        vendor_id: vendorId,
        amount,
        currency
      },
      "Payment executed for approved vendor against matched invoice."
    );

    const receipt = this.buildReceipt(
      envelope,
      "payment.execute",
      vendorId,
      ["vendor_approved", "invoice_matched", "amount_within_scope"],
      token.approval_reference
    );

    return { result, receipt };
  }
}
