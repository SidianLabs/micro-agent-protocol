import type {
  AgentDescriptor,
  DelegationToken,
  ExecutionReceipt,
  InvocationNegotiation,
  InvokeResult,
  ResultPackage,
  TaskEnvelope
} from "../types.js";
import { signReceipt, verifyDelegationTokenSignature } from "../security/signing.js";
import { validateDelegationToken } from "../validation/schema-validator.js";

export interface MicroAgent {
  readonly descriptor: AgentDescriptor;
  invoke(envelope: TaskEnvelope, token: DelegationToken): Promise<InvokeResult>;
}

export abstract class BaseMicroAgent implements MicroAgent {
  abstract readonly descriptor: AgentDescriptor;
  private static readonly seenTokenUses = new Map<string, number>();

  async invoke(envelope: TaskEnvelope, token: DelegationToken): Promise<InvokeResult> {
    this.assertAuthorized(envelope, token);
    return this.execute(envelope, token);
  }

  protected assertAuthorized(envelope: TaskEnvelope, token: DelegationToken): void {
    validateDelegationToken(token);

    if (token.subject_agent !== this.descriptor.agent_id) {
      throw new Error("Delegation token subject does not match target micro-agent.");
    }

    if (!verifyDelegationTokenSignature(token)) {
      throw new Error("Delegation token signature is invalid.");
    }

    const expiresAt = Date.parse(token.constraints.expires_at);
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("Delegation token is expired or invalid.");
    }

    const replayKey = `${token.signature}:${envelope.task_id}`;
    BaseMicroAgent.cleanupSeenTokenUses();
    if (BaseMicroAgent.seenTokenUses.has(replayKey)) {
      throw new Error("Delegation token replay detected.");
    }
    BaseMicroAgent.seenTokenUses.set(replayKey, expiresAt);

    const action = String(envelope.metadata?.capability ?? "");
    if (!action) {
      throw new Error("Missing capability binding in task envelope metadata.");
    }

    if (!token.allowed_actions.includes(action)) {
      throw new Error(`Delegation token does not allow action: ${action}`);
    }

    if (!this.scopeMatches(token.resource_scope, envelope.constraints)) {
      throw new Error("Delegation token resource scope does not match task constraints.");
    }

    const tokenRequester = token.requester_identity;
    if (!tokenRequester) {
      throw new Error("Delegation token requester identity is missing.");
    }

    if (
      tokenRequester.type !== envelope.requester_identity.type ||
      tokenRequester.id !== envelope.requester_identity.id
    ) {
      throw new Error("Delegation token requester identity does not match task requester.");
    }

    const tokenTenant = this.resolveTenantId(tokenRequester.tenant_id);
    const envelopeTenant = this.resolveTenantId(envelope.requester_identity.tenant_id);
    if (tokenTenant !== envelopeTenant) {
      throw new Error("Delegation token tenant scope does not match task tenant.");
    }
  }

  private scopeMatches(scope: Record<string, unknown>, constraints: Record<string, unknown>): boolean {
    return this.stableStringify(scope) === this.stableStringify(constraints);
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    }

    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b)
      );
      return `{${entries
        .map(([key, nestedValue]) => `${JSON.stringify(key)}:${this.stableStringify(nestedValue)}`)
        .join(",")}}`;
    }

    return JSON.stringify(value);
  }

  private static cleanupSeenTokenUses(): void {
    const now = Date.now();
    for (const [tokenUse, expiresAt] of this.seenTokenUses.entries()) {
      if (expiresAt <= now) {
        this.seenTokenUses.delete(tokenUse);
      }
    }
  }

  private resolveTenantId(tenantId: string | undefined): string {
    return tenantId && tenantId.trim().length > 0 ? tenantId : "default";
  }

  protected buildReceipt(
    envelope: TaskEnvelope,
    action: string,
    resourceTouched: string,
    policyChecks: string[],
    approvalUsed?: string
  ): ExecutionReceipt {
    const requestedSchemaVersion =
      typeof envelope.metadata?.requested_schema_version === "string"
        ? envelope.metadata.requested_schema_version
        : undefined;
    const executedSchemaVersion =
      typeof envelope.metadata?.executed_schema_version === "string"
        ? envelope.metadata.executed_schema_version
        : typeof envelope.metadata?.schema_version === "string"
          ? envelope.metadata.schema_version
          : undefined;
    const negotiation = this.resolveNegotiation(envelope);

    const unsignedReceipt = {
      receipt_id: `receipt:${envelope.task_id}`,
      task_id: envelope.task_id,
      tenant_id:
        typeof envelope.requester_identity.tenant_id === "string" &&
        envelope.requester_identity.tenant_id.trim().length > 0
          ? envelope.requester_identity.tenant_id
          : undefined,
      request_id:
        typeof envelope.metadata?.request_id === "string" ? envelope.metadata.request_id : undefined,
      agent_id: this.descriptor.agent_id,
      action_taken: action,
      resource_touched: resourceTouched,
      policy_checks: policyChecks,
      approval_used: approvalUsed,
      timestamp: new Date().toISOString(),
      result_hash: `sha256:${envelope.task_id}`,
      requested_schema_version: requestedSchemaVersion,
      executed_schema_version: executedSchemaVersion,
      negotiation
    };

    return {
      ...unsignedReceipt,
      signature: signReceipt(unsignedReceipt)
    };
  }

  protected buildResult(
    envelope: TaskEnvelope,
    status: ResultPackage["status"],
    structured_output: Record<string, unknown>,
    summary?: string
  ): ResultPackage {
    const requestedSchemaVersion =
      typeof envelope.metadata?.requested_schema_version === "string"
        ? envelope.metadata.requested_schema_version
        : undefined;
    const executedSchemaVersion =
      typeof envelope.metadata?.executed_schema_version === "string"
        ? envelope.metadata.executed_schema_version
        : typeof envelope.metadata?.schema_version === "string"
          ? envelope.metadata.schema_version
          : undefined;
    const negotiation = this.resolveNegotiation(envelope);

    return {
      task_id: envelope.task_id,
      status,
      summary,
      structured_output,
      negotiated_schema_version: executedSchemaVersion,
      requested_schema_version: requestedSchemaVersion,
      executed_schema_version: executedSchemaVersion,
      negotiation,
      followup_required: false,
      redactions_applied: ["credentials", "internal_reasoning"]
    };
  }

  private resolveNegotiation(envelope: TaskEnvelope): InvocationNegotiation {
    const metadataNegotiation =
      envelope.metadata?.negotiation &&
      typeof envelope.metadata.negotiation === "object" &&
      !Array.isArray(envelope.metadata.negotiation)
        ? (envelope.metadata.negotiation as Partial<InvocationNegotiation>)
        : undefined;

    const requestedSchemaVersion =
      typeof envelope.metadata?.requested_schema_version === "string"
        ? envelope.metadata.requested_schema_version
        : undefined;
    const executedSchemaVersion =
      typeof envelope.metadata?.executed_schema_version === "string"
        ? envelope.metadata.executed_schema_version
        : typeof envelope.metadata?.schema_version === "string"
          ? envelope.metadata.schema_version
          : undefined;
    const requestedDeliveryMode =
      metadataNegotiation?.requested?.delivery_mode === "async" ? "async" : "sync";
    const selectedDeliveryMode =
      metadataNegotiation?.selected?.delivery_mode === "async" ? "async" : requestedDeliveryMode;

    return {
      requested: {
        schema_version: requestedSchemaVersion,
        output_mode: envelope.requested_output_mode,
        delivery_mode: requestedDeliveryMode
      },
      selected: {
        schema_version: executedSchemaVersion,
        output_mode:
          metadataNegotiation?.selected?.output_mode ?? envelope.requested_output_mode,
        delivery_mode: selectedDeliveryMode
      },
      ...(metadataNegotiation?.provider_actions
        ? { provider_actions: metadataNegotiation.provider_actions }
        : {})
    };
  }

  protected abstract execute(
    envelope: TaskEnvelope,
    token: DelegationToken
  ): Promise<InvokeResult>;
}
