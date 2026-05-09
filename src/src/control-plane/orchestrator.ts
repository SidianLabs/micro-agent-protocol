import { AgentRegistry } from "./registry.js";
import { AsyncTaskQueue } from "./async-queue.js";
import { DelegationService } from "./delegation.js";
import { ReceiptStore } from "./receipt-store.js";
import { TaskStore } from "./task-store.js";
import type { MicroAgent } from "../runtime/micro-agent.js";
import type {
  ApprovalRequest,
  CapabilityDescriptor,
  ExecutionReceipt,
  InvocationNegotiation,
  InvocationNegotiationRequest,
  InvokeResult,
  TaskEnvelope
} from "../types.js";
import type { PolicyEngine } from "./policy.js";
import {
  validateDelegationToken,
  validateExecutionReceipt,
  validateResultPackage,
  validateTaskEnvelope
} from "../validation/schema-validator.js";
import { signReceipt } from "../security/signing.js";

export class OrchestratorRuntime {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly policyEngine: PolicyEngine,
    private readonly delegationService: DelegationService,
    private readonly runtimes: Map<string, MicroAgent>,
    private readonly taskStore: TaskStore,
    private readonly receiptStore: ReceiptStore,
    private readonly asyncQueue: AsyncTaskQueue
  ) {}

  async dispatch(
    envelope: TaskEnvelope,
    capability: string,
    requestedSchemaVersion?: string,
    negotiationRequest?: InvocationNegotiationRequest
  ): Promise<InvokeResult> {
    validateTaskEnvelope(envelope);

    const descriptor = this.resolveDescriptor(envelope.target_agent, capability);
    const idempotencyKey = this.resolveIdempotencyKey(envelope);
    if (idempotencyKey) {
      const existingByIdempotency = this.taskStore.findByIdempotencyKey(idempotencyKey);
      if (existingByIdempotency) {
        const sameIdempotencyIdentity =
          existingByIdempotency.requester_identity.type === envelope.requester_identity.type &&
          existingByIdempotency.requester_identity.id === envelope.requester_identity.id &&
          this.resolveTenantId(existingByIdempotency.requester_identity.tenant_id) ===
            this.resolveTenantId(envelope.requester_identity.tenant_id) &&
          existingByIdempotency.capability === capability &&
          existingByIdempotency.target_agent === descriptor.agent_id;

        if (!sameIdempotencyIdentity) {
          throw new Error(`Idempotency key conflict: ${idempotencyKey}`);
        }

        if (existingByIdempotency.result && existingByIdempotency.receipt) {
          return { result: existingByIdempotency.result, receipt: existingByIdempotency.receipt };
        }
      }
    }

    const existingTask = this.taskStore.get(envelope.task_id);
    if (existingTask) {
      const sameIdentity =
        existingTask.requester_identity.type === envelope.requester_identity.type &&
        existingTask.requester_identity.id === envelope.requester_identity.id &&
        this.resolveTenantId(existingTask.requester_identity.tenant_id) ===
          this.resolveTenantId(envelope.requester_identity.tenant_id) &&
        existingTask.capability === capability &&
        existingTask.target_agent === descriptor.agent_id;

      if (!sameIdentity) {
        throw new Error(`Task id conflict: ${envelope.task_id}`);
      }

      if (existingTask.result && existingTask.receipt) {
        return { result: existingTask.result, receipt: existingTask.receipt };
      }
    }

    const runtime = this.runtimes.get(descriptor.agent_id);
    if (!runtime) {
      throw new Error(`No runtime bound for agent: ${descriptor.agent_id}`);
    }

    const capabilityDescriptor = this.getCapabilityDescriptor(descriptor.agent_id, capability);
    const negotiation = this.negotiateInvocation(
      descriptor.visibility_modes,
      capabilityDescriptor,
      envelope,
      capability,
      requestedSchemaVersion,
      negotiationRequest
    );
    const negotiatedEnvelope = this.withNegotiatedInvocation(
      envelope,
      capability,
      negotiation
    );

    const decision = this.policyEngine.evaluate({ descriptor, envelope: negotiatedEnvelope });
    if (decision.action === "deny") {
      throw new Error(decision.reason ?? "Task denied by policy.");
    }

    if (decision.action === "require_approval") {
      const result = {
        task_id: envelope.task_id,
        status: "awaiting_approval" as const,
        summary: decision.reason ?? "Task requires approval before execution.",
        structured_output: {
          capability,
          target_agent: descriptor.agent_id,
          approval_reference: `approval:${envelope.task_id}`
        },
        negotiated_schema_version: negotiation.selected.schema_version,
        requested_schema_version: negotiation.requested.schema_version,
        executed_schema_version: negotiation.selected.schema_version,
        negotiation,
        followup_required: true,
        escalation_reason: decision.reason,
        redactions_applied: ["credentials", "internal_reasoning"]
      };

      const unsignedReceipt = {
        receipt_id: `receipt:${envelope.task_id}:approval`,
        task_id: envelope.task_id,
        tenant_id: this.resolveTenantId(envelope.requester_identity.tenant_id),
        request_id:
          typeof envelope.metadata?.request_id === "string" ? envelope.metadata.request_id : undefined,
        agent_id: descriptor.agent_id,
        action_taken: `${capability}.approval_required`,
        resource_touched: descriptor.domain,
        policy_checks: decision.policy_checks,
        approval_used: decision.approval_reference,
        timestamp: new Date().toISOString(),
        result_hash: `sha256:${envelope.task_id}:approval`,
        requested_schema_version: negotiation.requested.schema_version,
        executed_schema_version: negotiation.selected.schema_version,
        negotiation
      };

      const receipt = {
        ...unsignedReceipt,
        signature: signReceipt(unsignedReceipt)
      };

      validateResultPackage(result);
      validateExecutionReceipt(receipt);
      this.taskStore.save({
        task_id: envelope.task_id,
        requester_identity: envelope.requester_identity,
        idempotency_key: idempotencyKey,
        capability,
        target_agent: descriptor.agent_id,
        result,
        receipt
      });
      this.receiptStore.append(receipt);

      return { result, receipt };
    }

    const token = this.issueToken({
      capability,
      descriptorId: descriptor.agent_id,
      envelope: negotiatedEnvelope,
      approvalReference: decision.approval_reference
    });

    if (negotiatedEnvelope.metadata?.async === true) {
      const unsignedReceipt = {
        receipt_id: `receipt:${envelope.task_id}:running`,
        task_id: envelope.task_id,
        tenant_id: this.resolveTenantId(envelope.requester_identity.tenant_id),
        request_id:
          typeof envelope.metadata?.request_id === "string" ? envelope.metadata.request_id : undefined,
        agent_id: descriptor.agent_id,
        action_taken: `${capability}.running`,
        resource_touched: descriptor.domain,
        policy_checks: ["policy_passed"],
        approval_used: decision.approval_reference,
        timestamp: new Date().toISOString(),
        result_hash: `sha256:${envelope.task_id}:running`,
        requested_schema_version: negotiation.requested.schema_version,
        executed_schema_version: negotiation.selected.schema_version,
        negotiation
      };

      const receipt = {
        ...unsignedReceipt,
        signature: signReceipt(unsignedReceipt)
      };

      const result = {
        task_id: envelope.task_id,
        status: "running" as const,
        summary: "Task accepted and running asynchronously.",
        structured_output: {
          capability,
          target_agent: descriptor.agent_id,
          poll_path: `/tasks/${envelope.task_id}`
        },
        negotiated_schema_version: negotiation.selected.schema_version,
        requested_schema_version: negotiation.requested.schema_version,
        executed_schema_version: negotiation.selected.schema_version,
        negotiation,
        followup_required: true,
        redactions_applied: ["credentials", "internal_reasoning"]
      };

      validateResultPackage(result);
      validateExecutionReceipt(receipt);
      this.taskStore.save({
        task_id: envelope.task_id,
        requester_identity: envelope.requester_identity,
        idempotency_key: idempotencyKey,
        capability,
        target_agent: descriptor.agent_id,
        result,
        receipt
      });
      this.receiptStore.append(receipt);

      const enqueueResult = this.asyncQueue.enqueue({
        taskId: envelope.task_id,
        tenantId: this.resolveTenantId(envelope.requester_identity.tenant_id),
        run: async () => {
          const completed = await runtime.invoke(
            {
              ...negotiatedEnvelope,
              target_agent: descriptor.agent_id,
              delegation_token: token.signature
            },
            token
          );
          const normalizedCompleted = this.withNegotiatedOutcome(completed, negotiation);
          this.taskStore.update(envelope.task_id, {
            status: normalizedCompleted.result.status,
            result: normalizedCompleted.result,
            receipt: normalizedCompleted.receipt
          });
          this.receiptStore.append(normalizedCompleted.receipt);
        },
        onDeadLetter: (deadLetter) => {
          const unsignedReceipt = {
            receipt_id: `receipt:${envelope.task_id}:failed`,
            task_id: envelope.task_id,
            tenant_id: this.resolveTenantId(envelope.requester_identity.tenant_id),
            request_id:
              typeof envelope.metadata?.request_id === "string"
                ? envelope.metadata.request_id
                : undefined,
            agent_id: descriptor.agent_id,
            action_taken: `${capability}.failed`,
            resource_touched: descriptor.domain,
            policy_checks: ["execution_failed"],
            timestamp: new Date().toISOString(),
            result_hash: `sha256:${envelope.task_id}:failed`
          };
          this.taskStore.update(envelope.task_id, {
            status: "failed",
            result: {
              task_id: envelope.task_id,
              status: "failed",
              summary: deadLetter.error,
              structured_output: { capability, target_agent: descriptor.agent_id },
              negotiated_schema_version: negotiation.selected.schema_version,
              requested_schema_version: negotiation.requested.schema_version,
              executed_schema_version: negotiation.selected.schema_version,
              negotiation,
              followup_required: false,
              redactions_applied: ["credentials", "internal_reasoning"]
            },
            receipt: (() => {
              const failedReceipt = {
                ...unsignedReceipt,
                requested_schema_version: negotiation.requested.schema_version,
                executed_schema_version: negotiation.selected.schema_version,
                negotiation
              };
              return {
                ...failedReceipt,
                signature: signReceipt(failedReceipt)
              };
            })()
          });
          const failedTask = this.taskStore.get(envelope.task_id);
          if (failedTask?.receipt) {
            this.receiptStore.append(failedTask.receipt);
          }
        }
      });
      if (!enqueueResult.accepted) {
        throw new Error("Async queue capacity exceeded.");
      }

      return { result, receipt };
    }

    const invokeResult = await runtime.invoke(
      {
        ...negotiatedEnvelope,
        target_agent: descriptor.agent_id,
        delegation_token: token.signature
      },
      token
    );

    const normalizedInvokeResult = this.withNegotiatedOutcome(invokeResult, negotiation);
    validateResultPackage(normalizedInvokeResult.result);
    validateExecutionReceipt(normalizedInvokeResult.receipt);
    this.taskStore.save({
      task_id: envelope.task_id,
      requester_identity: envelope.requester_identity,
      idempotency_key: idempotencyKey,
      capability,
      target_agent: descriptor.agent_id,
      result: normalizedInvokeResult.result,
      receipt: normalizedInvokeResult.receipt
    });
    this.receiptStore.append(normalizedInvokeResult.receipt);

    return normalizedInvokeResult;
  }

  async approve(request: ApprovalRequest): Promise<InvokeResult> {
    const {
      envelope,
      capability,
      approval_reference: approvalReference,
      requested_schema_version: requestedSchemaVersion,
      negotiation: negotiationRequest
    } = request;
    validateTaskEnvelope(envelope);

    if (request.task_id !== envelope.task_id) {
      throw new Error("Approval request task_id does not match the envelope task_id.");
    }

    const descriptor = this.resolveDescriptor(envelope.target_agent, capability);

    const runtime = this.runtimes.get(descriptor.agent_id);
    if (!runtime) {
      throw new Error(`No runtime bound for agent: ${descriptor.agent_id}`);
    }

    const capabilityDescriptor = this.getCapabilityDescriptor(descriptor.agent_id, capability);
    const negotiation = this.negotiateInvocation(
      descriptor.visibility_modes,
      capabilityDescriptor,
      envelope,
      capability,
      requestedSchemaVersion,
      negotiationRequest
    );
    const negotiatedEnvelope = this.withNegotiatedInvocation(
      envelope,
      capability,
      negotiation
    );

    const pendingTask = this.taskStore.get(request.task_id);
    if (!pendingTask) {
      throw new Error(`Approval task not found: ${request.task_id}`);
    }

    if (pendingTask.status !== "awaiting_approval") {
      throw new Error(`Task is not awaiting approval: ${request.task_id}`);
    }

    if (pendingTask.capability !== capability) {
      throw new Error(`Approval capability mismatch for task: ${request.task_id}`);
    }

    if (pendingTask.target_agent !== descriptor.agent_id) {
      throw new Error(`Approval target agent mismatch for task: ${request.task_id}`);
    }

    const expectedApprovalReference = String(
      pendingTask.result?.structured_output?.approval_reference ?? ""
    );
    if (!expectedApprovalReference || expectedApprovalReference !== approvalReference) {
      throw new Error(`Invalid approval reference for task: ${request.task_id}`);
    }

    const token = this.issueToken({
      capability,
      descriptorId: descriptor.agent_id,
      envelope: negotiatedEnvelope,
      approvalReference
    });

    const invokeResult = await runtime.invoke(
      {
        ...negotiatedEnvelope,
        target_agent: descriptor.agent_id,
        delegation_token: token.signature
      },
      token
    );

    const normalizedInvokeResult = this.withNegotiatedOutcome(invokeResult, negotiation);
    validateResultPackage(normalizedInvokeResult.result);
    validateExecutionReceipt(normalizedInvokeResult.receipt);
    this.taskStore.update(envelope.task_id, {
      status: normalizedInvokeResult.result.status,
      result: normalizedInvokeResult.result,
      receipt: normalizedInvokeResult.receipt
    });
    this.receiptStore.append(normalizedInvokeResult.receipt);

    return normalizedInvokeResult;
  }

  getTask(taskId: string) {
    return this.taskStore.get(taskId);
  }

  private issueToken(args: {
    capability: string;
    descriptorId: string;
    envelope: TaskEnvelope;
    approvalReference?: string;
  }) {
    const token = this.delegationService.issue({
      subject_agent: args.descriptorId,
      allowed_actions: [args.capability],
      resource_scope: args.envelope.constraints,
      requester_identity: args.envelope.requester_identity,
      policy: {
        allowed: true,
        action: "allow",
        policy_checks: ["policy_passed"],
        approval_reference: args.approvalReference,
        scoped_constraints: args.envelope.constraints
      },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
    validateDelegationToken(token);
    return token;
  }

  private getCapabilityDescriptor(
    agentId: string,
    capability: string
  ): CapabilityDescriptor | undefined {
    return this.registry.getCapabilityDescriptor(agentId, capability);
  }

  private negotiateInvocation(
    supportedVisibilityModes: TaskEnvelope["requested_output_mode"][],
    capabilityDescriptor: CapabilityDescriptor | undefined,
    envelope: TaskEnvelope,
    capability: string,
    requestedSchemaVersion?: string,
    negotiationRequest?: InvocationNegotiationRequest
  ): InvocationNegotiation {
    if (
      requestedSchemaVersion &&
      negotiationRequest?.schema_version &&
      requestedSchemaVersion !== negotiationRequest.schema_version
    ) {
      throw new Error(
        "Negotiation schema_version conflicts with requested_schema_version."
      );
    }

    const requestedDeliveryMode = this.resolveRequestedDeliveryMode(
      envelope,
      negotiationRequest
    );
    this.assertSupportedVisibilityMode(supportedVisibilityModes, capability, envelope.requested_output_mode);

    const schemaResolution = this.negotiateSchemaVersion(
      capabilityDescriptor,
      capability,
      negotiationRequest?.schema_version ?? requestedSchemaVersion
    );

    return {
      requested: {
        schema_version: schemaResolution.requested,
        output_mode: envelope.requested_output_mode,
        delivery_mode: requestedDeliveryMode
      },
      selected: {
        schema_version: schemaResolution.executed,
        output_mode: envelope.requested_output_mode,
        delivery_mode: requestedDeliveryMode
      },
      ...(schemaResolution.requested &&
      schemaResolution.executed &&
      schemaResolution.requested !== schemaResolution.executed
        ? { provider_actions: ["schema_translated" as const] }
        : {})
    };
  }

  private negotiateSchemaVersion(
    capabilityDescriptor: CapabilityDescriptor | undefined,
    capability: string,
    requestedSchemaVersion?: string
  ): { requested?: string; executed?: string } {
    if (!capabilityDescriptor) {
      return {
        requested: requestedSchemaVersion,
        executed: requestedSchemaVersion
      };
    }

    const supportedVersions = capabilityDescriptor.supported_schema_versions ?? [];
    const preferredVersion =
      capabilityDescriptor.preferred_schema_version ?? capabilityDescriptor.schema_version;
    const translationTargets = capabilityDescriptor.translation_targets ?? [];

    if (!requestedSchemaVersion) {
      return {
        requested: preferredVersion,
        executed: preferredVersion
      };
    }

    const translationTarget = translationTargets.find(
      (target) => target.from === requestedSchemaVersion
    );
    if (translationTarget) {
      return {
        requested: requestedSchemaVersion,
        executed: translationTarget.to
      };
    }

    if (supportedVersions.length === 0 || supportedVersions.includes(requestedSchemaVersion)) {
      return {
        requested: requestedSchemaVersion,
        executed: requestedSchemaVersion
      };
    }

    throw new Error(
      `Unsupported schema version for ${capability}: ${requestedSchemaVersion}. Supported versions: ${supportedVersions.join(", ")}`
    );
  }

  private withNegotiatedInvocation(
    envelope: TaskEnvelope,
    capability: string,
    negotiation: InvocationNegotiation
  ): TaskEnvelope {
    return {
      ...envelope,
      requested_output_mode: negotiation.selected.output_mode,
      metadata: {
        ...(envelope.metadata ?? {}),
        capability,
        tenant_id: this.resolveTenantId(envelope.requester_identity.tenant_id),
        async: negotiation.selected.delivery_mode === "async",
        ...(negotiation.selected.schema_version
          ? { schema_version: negotiation.selected.schema_version }
          : {}),
        ...(negotiation.requested.schema_version
          ? { requested_schema_version: negotiation.requested.schema_version }
          : {}),
        ...(negotiation.selected.schema_version
          ? { executed_schema_version: negotiation.selected.schema_version }
          : {}),
        negotiation
      }
    };
  }

  private withNegotiatedOutcome(
    invokeResult: InvokeResult,
    negotiation: InvocationNegotiation
  ): InvokeResult {
    const unsignedReceipt: Omit<ExecutionReceipt, "signature"> = {
      ...invokeResult.receipt,
      requested_schema_version:
        invokeResult.receipt.requested_schema_version ?? negotiation.requested.schema_version,
      executed_schema_version:
        invokeResult.receipt.executed_schema_version ?? negotiation.selected.schema_version,
      negotiation: invokeResult.receipt.negotiation ?? negotiation
    };

    return {
      result: {
        ...invokeResult.result,
        negotiated_schema_version:
          invokeResult.result.negotiated_schema_version ?? negotiation.selected.schema_version,
        requested_schema_version:
          invokeResult.result.requested_schema_version ?? negotiation.requested.schema_version,
        executed_schema_version:
          invokeResult.result.executed_schema_version ?? negotiation.selected.schema_version,
        negotiation: invokeResult.result.negotiation ?? negotiation
      },
      receipt: {
        ...unsignedReceipt,
        signature: signReceipt(unsignedReceipt)
      }
    };
  }

  private assertSupportedVisibilityMode(
    supportedVisibilityModes: TaskEnvelope["requested_output_mode"][],
    capability: string,
    requestedOutputMode: TaskEnvelope["requested_output_mode"]
  ): void {
    if (
      supportedVisibilityModes.length > 0 &&
      !supportedVisibilityModes.includes(requestedOutputMode)
    ) {
      throw new Error(
        `Unsupported output mode for ${capability}: ${requestedOutputMode}. Supported modes: ${supportedVisibilityModes.join(", ")}`
      );
    }
  }

  private resolveRequestedDeliveryMode(
    envelope: TaskEnvelope,
    negotiationRequest?: InvocationNegotiationRequest
  ): "sync" | "async" {
    const metadataAsync =
      typeof envelope.metadata?.async === "boolean" ? envelope.metadata.async : undefined;

    if (
      negotiationRequest?.delivery_mode &&
      typeof metadataAsync === "boolean" &&
      (negotiationRequest.delivery_mode === "async") !== metadataAsync
    ) {
      throw new Error(
        "Negotiation delivery mode conflicts with envelope metadata.async."
      );
    }

    if (negotiationRequest?.delivery_mode) {
      return negotiationRequest.delivery_mode;
    }

    return metadataAsync === true ? "async" : "sync";
  }

  private resolveDescriptor(targetAgent: string, capability: string) {
    const descriptor = this.registry.get(targetAgent);
    if (!descriptor) {
      throw new Error(`No micro-agent found for target agent: ${targetAgent}`);
    }
    if (descriptor.registry_status === "disabled") {
      throw new Error(`Target agent is disabled in registry: ${targetAgent}`);
    }

    if (!descriptor.capabilities.includes(capability)) {
      throw new Error(
        `Capability not supported by target agent ${targetAgent}: ${capability}`
      );
    }
    const capabilityDescriptor = this.getCapabilityDescriptor(targetAgent, capability);
    if (capabilityDescriptor?.status === "disabled") {
      throw new Error(`Capability is disabled for target agent ${targetAgent}: ${capability}`);
    }

    return descriptor;
  }

  private resolveTenantId(tenantId: string | undefined): string {
    return tenantId && tenantId.trim().length > 0 ? tenantId : "default";
  }

  private resolveIdempotencyKey(envelope: TaskEnvelope): string | undefined {
    const value = envelope.metadata?.idempotency_key;
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }
}
