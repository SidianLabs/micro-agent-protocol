import { BaseMicroAgent } from "../../src/src/runtime/micro-agent.js";
import type {
  AgentDescriptor,
  DelegationToken,
  InvokeResult,
  TaskEnvelope
} from "../../src/src/types.js";

export class DBReadAgent extends BaseMicroAgent {
  readonly descriptor: AgentDescriptor = {
    agent_id: "dbread-agent-v1",
    organization: "example-corp",
    version: "1.0.0",
    domain: "database",
    capabilities: ["db.read.query", "db.read.lookup", "db.read.aggregate"],
    risk_level: "medium",
    input_schema_ref: "schema://dbread-agent/input",
    output_schema_ref: "schema://dbread-agent/output",
    supported_execution_modes: ["read", "analyze"],
    approval_requirements: ["environment_policy"],
    visibility_modes: ["summary", "structured_only", "redacted"],
    policy_hooks: ["environment_check", "field_visibility_check"],
    display_name: "Database Read Agent",
    provider_url: "https://example-corp.local/platform/data",
    documentation_url: "https://example-corp.local/docs/map/dbread-agent",
    auth_schemes: ["signed_request"],
    capability_descriptors: [
      {
        name: "db.read.query",
        execution_mode: "read",
        request_schema_ref: "schema://db.read.query/request",
        response_schema_ref: "schema://db.read.query/response",
        constraint_schema_ref: "schema://db.read.query/constraints",
        approval_required_by_default: false,
        auth_schemes: ["none", "bearer", "signed_request"],
        schema_version: "1.0.0",
        supported_schema_versions: ["1.0.0"],
        preferred_schema_version: "1.0.0",
        compatibility: "backward_compatible",
        status: "active"
      },
      {
        name: "db.read.lookup",
        execution_mode: "read",
        request_schema_ref: "schema://db.read.lookup/request",
        response_schema_ref: "schema://db.read.lookup/response",
        constraint_schema_ref: "schema://db.read.lookup/constraints",
        approval_required_by_default: false,
        auth_schemes: ["none", "bearer", "signed_request"],
        schema_version: "1.0.0",
        supported_schema_versions: ["1.0.0"],
        preferred_schema_version: "1.0.0",
        compatibility: "backward_compatible",
        status: "active"
      },
      {
        name: "db.read.aggregate",
        execution_mode: "analyze",
        request_schema_ref: "schema://db.read.aggregate/request",
        response_schema_ref: "schema://db.read.aggregate/response",
        constraint_schema_ref: "schema://db.read.aggregate/constraints",
        approval_required_by_default: false,
        auth_schemes: ["bearer", "signed_request"],
        schema_version: "1.1.0",
        supported_schema_versions: ["1.0.0", "1.1.0"],
        preferred_schema_version: "1.1.0",
        compatibility: "backward_compatible",
        status: "active"
      }
    ],
    transport_bindings: [{ kind: "http", endpoint: "https://example-corp.local/map" }],
    tags: ["database", "read", "analytics"],
    registry_status: "active",
    description: "Example MAP micro-agent for bounded database reads."
  };

  protected async execute(envelope: TaskEnvelope, _token: DelegationToken): Promise<InvokeResult> {
    const common = (envelope.constraints.common ?? {}) as Record<string, unknown>;
    const domain = (envelope.constraints.domain ?? {}) as Record<string, unknown>;
    const environment = String(common.environment ?? "unknown");
    const dataset = String(domain.dataset ?? "unknown_dataset");
    const service = String(domain.service ?? "unknown_service");

    const result = this.buildResult(
      envelope,
      "completed",
      {
        service,
        environment,
        open_incidents: 2,
        highest_severity: "high"
      },
      `Returned summarized incident metrics for the ${service} service in ${environment}.`
    );

    const receipt = this.buildReceipt(
      envelope,
      "db.read.aggregate",
      dataset,
      ["environment_allowed", "dataset_allowed"],
      _token.approval_reference
    );

    return { result, receipt };
  }
}
