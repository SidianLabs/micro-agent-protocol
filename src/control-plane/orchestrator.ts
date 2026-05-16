import { randomUUID } from "node:crypto";
import { AgentRegistry } from "./registry.js";
import { AsyncTaskQueue } from "./async-queue.js";
import { DelegationService } from "./delegation.js";
import { ReceiptStore } from "./receipt-store.js";
import { TaskStore } from "./task-store.js";
import type {
  ApprovalRequest,
  CapabilityDescriptor,
  InvocationNegotiation,
  InvocationNegotiationRequest,
  InvokeResult,
  ResultPackage,
  TaskEnvelope,
} from "../types.js";
import type { ExecutionReceipt as MapExecutionReceipt } from "../types.js";
import type { ExecutionReceipt as ECPCoreExecutionReceipt } from "../core/types.js";
import { validate as coreValidate, normalize as coreNormalize, evaluate as coreEvaluatePolicy } from "../core/index.js";
import type { Executor, Intent, PolicyDocument, ExecutionAdapter, ExecutionResult } from "../core/index.js";
import { mapEnvelopeToIntent } from "../integration/ecp-bridge.js";
import {
  validateDelegationToken,
  validateExecutionReceipt,
  validateResultPackage,
  validateTaskEnvelope,
} from "../validation/schema-validator.js";
import { signReceipt } from "../security/signing.js";
import { ApprovalNotifier } from "../server/approval-notifier.js";

export class OrchestratorRuntime {
  private readonly approvalNotifier: ApprovalNotifier;

  constructor(
    private readonly registry: AgentRegistry,
    private readonly delegationService: DelegationService,
    private readonly taskStore: TaskStore,
    private readonly receiptStore: ReceiptStore,
    private readonly asyncQueue: AsyncTaskQueue,
    private readonly coreExecutor: Executor,
    private policy: PolicyDocument,
    approvalNotifierOptions?: { defaultWebhookUrl?: string; serverBaseUrl?: string },
  ) {
    this.approvalNotifier = new ApprovalNotifier({
      defaultWebhookUrl: approvalNotifierOptions?.defaultWebhookUrl,
      serverBaseUrl: approvalNotifierOptions?.serverBaseUrl,
    });
  }

  /**
   * Hot-swap the active policy document at runtime.
   * Takes effect immediately for all subsequent dispatches.
   */
  setPolicy(policy: PolicyDocument): void {
    this.policy = policy;
    this.coreExecutor.setPolicy(policy);
  }

  /**
   * Returns the current active policy document.
   */
  getPolicy(): PolicyDocument {
    return this.policy;
  }

  async dispatch(
    envelope: TaskEnvelope,
    capability: string,
    requestedSchemaVersion?: string,
    negotiationRequest?: InvocationNegotiationRequest,
  ): Promise<InvokeResult> {
    validateTaskEnvelope(envelope);

    const descriptor = this.resolveDescriptor(
      envelope.target_agent,
      capability,
    );
    const capabilityDescriptor = this.registry.getCapabilityDescriptor(
      envelope.target_agent,
      capability,
    );

    const contextId = envelope.context_id ?? randomUUID();

    if (descriptor.extensions) {
      const envelopeExtensions = envelope.extensions ?? [];
      for (const ext of descriptor.extensions) {
        if (ext.required && !envelopeExtensions.includes(ext.uri)) {
          throw new Error(
            `Extension "${ext.uri}" is required by agent "${descriptor.agent_id}" but was not declared in the task envelope.`,
          );
        }
      }
    }

    const idempotencyKey = this.resolveIdempotencyKey(envelope);
    if (idempotencyKey) {
      const existingByIdempotency =
        this.taskStore.findByIdempotencyKey(idempotencyKey);
      if (existingByIdempotency) {
        const sameIdempotencyIdentity =
          existingByIdempotency.requester_identity.type ===
            envelope.requester_identity.type &&
          existingByIdempotency.requester_identity.id ===
            envelope.requester_identity.id &&
          this.resolveTenantId(
            existingByIdempotency.requester_identity.tenant_id,
          ) === this.resolveTenantId(envelope.requester_identity.tenant_id) &&
          existingByIdempotency.capability === capability &&
          existingByIdempotency.target_agent === descriptor.agent_id;

        if (!sameIdempotencyIdentity) {
          throw new Error(`Idempotency key conflict: ${idempotencyKey}`);
        }

      if (existingByIdempotency.result && existingByIdempotency.receipt) {
          if (existingByIdempotency.status === "accepted") {
            return this.waitForStoredResult(existingByIdempotency.task_id);
          }
          return {
            result: existingByIdempotency.result,
            receipt: existingByIdempotency.receipt,
          };
        }
      }
    }

    const existingTask = this.taskStore.get(envelope.task_id);
    if (existingTask) {
      const sameIdentity =
        existingTask.requester_identity.type ===
          envelope.requester_identity.type &&
        existingTask.requester_identity.id === envelope.requester_identity.id &&
        this.resolveTenantId(existingTask.requester_identity.tenant_id) ===
          this.resolveTenantId(envelope.requester_identity.tenant_id) &&
        existingTask.capability === capability &&
        existingTask.target_agent === descriptor.agent_id;

      if (!sameIdentity) {
        throw new Error(`Task id conflict: ${envelope.task_id}`);
      }

      if (existingTask.result && existingTask.receipt) {
        if (existingTask.status === "accepted") {
          return this.waitForStoredResult(existingTask.task_id);
        }
        return { result: existingTask.result, receipt: existingTask.receipt };
      }
    }

    const negotiation = this.negotiateInvocation(
      descriptor.visibility_modes,
      capabilityDescriptor,
      envelope,
      capability,
      requestedSchemaVersion,
      negotiationRequest,
    );

    const decision = this.evaluatePolicy(envelope, capability);
    if (decision.action === "deny") {
      this.notifyWebhook(envelope, {
        status: "denied",
        summary: decision.reason ?? "Task denied by policy.",
      });
      throw new Error(decision.reason ?? "Task denied by policy.");
    }

    if (decision.action === "require_approval") {
      const approvalReference = `approval:${envelope.task_id}`;
      const result: ResultPackage = {
        task_id: envelope.task_id,
        context_id: contextId,
        status: "awaiting_approval" as const,
        summary: decision.reason
          ? `${decision.reason} - task will require approval before execution.`
          : "Task will require approval before execution.",
        structured_output: {
          capability,
          target_agent: descriptor.agent_id,
          approval_reference: approvalReference,
        },
        negotiated_schema_version: negotiation?.selected?.schema_version,
        requested_schema_version: negotiation?.requested?.schema_version,
        executed_schema_version: negotiation?.selected?.schema_version,
        negotiation,
        followup_required: true,
        escalation_reason: decision.reason,
        redactions_applied: ["credentials", "internal_reasoning"],
        extensions: envelope.extensions,
      };

      const unsignedReceipt = this.buildUnsignedReceipt(envelope, descriptor, capability, `${capability}.approval_required`, decision);
      const signature = signReceipt(unsignedReceipt);
      const receipt: MapExecutionReceipt = { ...unsignedReceipt, signature };

      validateResultPackage(result);
      this.taskStore.save({
        task_id: envelope.task_id,
        context_id: contextId,
        requester_identity: envelope.requester_identity,
        idempotency_key: idempotencyKey,
        capability,
        target_agent: descriptor.agent_id,
        result,
        receipt,
      });
      this.receiptStore.append(receipt);

      // Notify approver via webhook
      const inputSummary = (() => {
        try { return JSON.parse(envelope.intent) as Record<string, unknown>; } catch { return {}; }
      })();
      this.approvalNotifier.notify({
        taskId: envelope.task_id,
        capability,
        targetAgent: descriptor.agent_id,
        reason: decision.reason ?? "Policy requires approval.",
        requester: envelope.requester_identity,
        riskClass: envelope.risk_class,
        inputSummary,
        approvalReference,
        webhookUrl: typeof envelope.metadata?.webhook_url === "string"
          ? envelope.metadata.webhook_url
          : undefined,
      });

      return { result, receipt };
    }

    const intent = mapEnvelopeToIntent(envelope, capability);

    const intentValidation = coreValidate(intent);
    if (!intentValidation.valid) {
      throw new Error(`Invalid intent: ${intentValidation.errors.map((e) => e.message).join(", ")}`);
    }

    if (negotiation?.selected?.delivery_mode === "async" || envelope.metadata?.async === true) {
      if (!this.asyncQueue.hasCapacity()) {
        throw new Error("Async queue capacity exceeded.");
      }

      const runningResult: ResultPackage = {
        task_id: envelope.task_id,
        context_id: contextId,
        status: "running" as const,
        summary: "Task accepted and running asynchronously.",
        structured_output: {
          capability,
          target_agent: descriptor.agent_id,
          poll_path: `/tasks/${envelope.task_id}`,
        },
        negotiated_schema_version: negotiation?.selected?.schema_version,
        requested_schema_version: negotiation?.requested?.schema_version,
        executed_schema_version: negotiation?.selected?.schema_version,
        negotiation,
        followup_required: true,
        redactions_applied: ["credentials", "internal_reasoning"],
        extensions: envelope.extensions,
      };

      const runningUnsignedReceipt = this.buildUnsignedReceipt(envelope, descriptor, capability, `${capability}.running`, decision);
      const runningSignature = signReceipt(runningUnsignedReceipt);
      const runningReceipt: MapExecutionReceipt = { ...runningUnsignedReceipt, signature: runningSignature };

      this.taskStore.save({
        task_id: envelope.task_id,
        context_id: contextId,
        requester_identity: envelope.requester_identity,
        idempotency_key: idempotencyKey,
        capability,
        target_agent: descriptor.agent_id,
        result: runningResult,
        receipt: runningReceipt,
      });
      this.receiptStore.append(runningReceipt);

      const enqueueResult = this.asyncQueue.enqueue({
        taskId: envelope.task_id,
        tenantId: this.resolveTenantId(envelope.requester_identity.tenant_id),
        idempotencyToken: envelope.idempotency_token,
        run: async () => {
          const coreResult = await this.coreExecutor.execute(intent);
          const normalizedResult = this.normalizeCoreResult(
            coreResult as ExecutionResult | ECPCoreExecutionReceipt,
            envelope,
            capability,
            negotiation,
          );
          this.taskStore.update(envelope.task_id, {
            status: normalizedResult.result.status,
            result: normalizedResult.result,
            receipt: normalizedResult.receipt,
          });
          this.receiptStore.append(normalizedResult.receipt);
          this.notifyWebhook(envelope, {
            status: normalizedResult.result.status,
            summary: normalizedResult.result.summary,
            structured_output: normalizedResult.result.structured_output,
          });
        },
        onDeadLetter: (deadLetter) => {
          const deadLetterResult: ResultPackage = {
            task_id: envelope.task_id,
            context_id: contextId,
            status: "failed",
            summary: deadLetter.error,
            structured_output: { capability, target_agent: descriptor.agent_id },
            negotiation,
            followup_required: false,
            redactions_applied: ["credentials", "internal_reasoning"],
            extensions: envelope.extensions,
          };
          const deadLetterUnsignedReceipt = this.buildUnsignedReceipt(envelope, descriptor, capability, `${capability}.dead_lettered`, decision);
          const deadLetterSignature = signReceipt(deadLetterUnsignedReceipt);
          const deadLetterReceipt: MapExecutionReceipt = { ...deadLetterUnsignedReceipt, signature: deadLetterSignature };
          this.taskStore.update(envelope.task_id, {
            status: "failed",
            result: deadLetterResult,
            receipt: deadLetterReceipt,
          });
          const deadLetterTask = this.taskStore.get(envelope.task_id);
          if (deadLetterTask?.receipt) {
            this.receiptStore.append(deadLetterTask.receipt);
            this.notifyWebhook(envelope, { status: "failed", summary: deadLetter.error });
          }
        },
      });

      if (!enqueueResult.accepted) {
        this.taskStore.delete(envelope.task_id);
        throw new Error("Async queue capacity exceeded.");
      }

      return { result: runningResult, receipt: runningReceipt };
    }

    const pendingResult: ResultPackage = {
      task_id: envelope.task_id,
      context_id: contextId,
      status: "accepted",
      summary: "Task accepted for synchronous execution.",
      structured_output: {
        capability,
        target_agent: descriptor.agent_id,
      },
      negotiated_schema_version: negotiation?.selected?.schema_version,
      requested_schema_version: negotiation?.requested?.schema_version,
      executed_schema_version: negotiation?.selected?.schema_version,
      negotiation,
      followup_required: false,
      redactions_applied: ["credentials", "internal_reasoning"],
      extensions: envelope.extensions,
    };
    const pendingUnsignedReceipt = this.buildUnsignedReceipt(
      envelope,
      descriptor,
      capability,
      `${capability}.accepted`,
      decision,
    );
    const pendingReceipt: MapExecutionReceipt = {
      ...pendingUnsignedReceipt,
      signature: signReceipt(pendingUnsignedReceipt),
    };
    this.taskStore.save({
      task_id: envelope.task_id,
      context_id: contextId,
      requester_identity: envelope.requester_identity,
      idempotency_key: idempotencyKey,
      capability,
      target_agent: descriptor.agent_id,
      result: pendingResult,
      receipt: pendingReceipt,
    });

    const coreResult = await this.coreExecutor.executeApproved(intent);
    const normalizedResult = this.normalizeCoreResult(
      coreResult as ExecutionResult | ECPCoreExecutionReceipt,
      envelope,
      capability,
      negotiation,
    );
    this.taskStore.update(envelope.task_id, {
      status: normalizedResult.result.status,
      result: normalizedResult.result,
      receipt: normalizedResult.receipt,
    });
    this.receiptStore.append(normalizedResult.receipt);

    this.notifyWebhook(envelope, {
      status: normalizedResult.result.status,
      summary: normalizedResult.result.summary,
      structured_output: normalizedResult.result.structured_output,
    });

    return normalizedResult;
  }

  async approve(request: ApprovalRequest): Promise<InvokeResult> {
    const {
      envelope,
      capability,
      approval_reference: approvalReference,
      requested_schema_version: requestedSchemaVersion,
      negotiation: negotiationRequest,
    } = request;
    validateTaskEnvelope(envelope);

    if (request.task_id !== envelope.task_id) {
      throw new Error(
        "Approval request task_id does not match the envelope task_id.",
      );
    }

    const descriptor = this.resolveDescriptor(
      envelope.target_agent,
      capability,
    );
    const capabilityDescriptor = this.registry.getCapabilityDescriptor(
      envelope.target_agent,
      capability,
    );

    const negotiation = this.negotiateInvocation(
      descriptor.visibility_modes,
      capabilityDescriptor,
      envelope,
      capability,
      requestedSchemaVersion,
      negotiationRequest,
    );

    const pendingTask = this.taskStore.get(request.task_id);
    if (!pendingTask) {
      throw new Error(`Approval task not found: ${request.task_id}`);
    }

    if (pendingTask.status !== "awaiting_approval") {
      throw new Error(`Task is not awaiting approval: ${request.task_id}`);
    }

    if (pendingTask.capability !== capability) {
      throw new Error(
        `Approval capability mismatch for task: ${request.task_id}`,
      );
    }

    if (pendingTask.target_agent !== descriptor.agent_id) {
      throw new Error(
        `Approval target agent mismatch for task: ${request.task_id}`,
      );
    }

    const expectedApprovalReference = String(
      pendingTask.result?.structured_output?.approval_reference ?? "",
    );
    if (
      !expectedApprovalReference ||
      expectedApprovalReference !== approvalReference
    ) {
      throw new Error(
        `Invalid approval reference for task: ${request.task_id}`,
      );
    }

    const intent = mapEnvelopeToIntent(envelope, capability);
    const coreResult = await this.coreExecutor.executeApproved(intent);
    const normalizedResult = this.normalizeCoreResult(
      coreResult as ExecutionResult | ECPCoreExecutionReceipt,
      envelope,
      capability,
      negotiation,
    );
    normalizedResult.receipt = {
      ...normalizedResult.receipt,
      approval_used: approvalReference,
    };

    this.taskStore.update(envelope.task_id, {
      status: normalizedResult.result.status,
      result: normalizedResult.result,
      receipt: normalizedResult.receipt,
    });
    this.receiptStore.append(normalizedResult.receipt);

    this.notifyWebhook(envelope, {
      status: normalizedResult.result.status,
      summary: normalizedResult.result.summary,
      structured_output: normalizedResult.result.structured_output,
    });

    return normalizedResult;
  }

  getTask(taskId: string) {
    return this.taskStore.get(taskId);
  }

  cancelTask(taskId: string, tenantId?: string): InvokeResult {
    const CANCELLABLE_STATES = [
      "accepted",
      "proposed",
      "awaiting_approval",
      "running",
    ];

    const existingTask = tenantId
      ? this.taskStore.getByTenant(taskId, tenantId)
      : this.taskStore.get(taskId);

    if (!existingTask) {
      throw new Error("Task not found: " + taskId);
    }

    if (!CANCELLABLE_STATES.includes(existingTask.status)) {
      throw new Error(
        "Task cannot be cancelled in its current state: " + existingTask.status,
      );
    }

    const result: ResultPackage = {
      task_id: taskId,
      status: "revoked",
      summary: "Task was cancelled by the requester.",
      structured_output: {
        target_agent: existingTask.target_agent,
        capability: existingTask.capability,
        previous_status: existingTask.status,
      },
      negotiated_schema_version: existingTask.result?.negotiated_schema_version,
      requested_schema_version: existingTask.result?.requested_schema_version,
      executed_schema_version: existingTask.result?.executed_schema_version,
      redactions_applied: ["internal_reasoning"],
      followup_required: false,
      escalation_reason: undefined,
    };

    const unsignedReceipt: Omit<MapExecutionReceipt, "signature"> = {
      receipt_id: "receipt:" + taskId + ":cancel",
      task_id: taskId,
      tenant_id: this.resolveTenantId(
        existingTask.requester_identity.tenant_id,
      ),
      request_id: existingTask.receipt?.request_id,
      agent_id: existingTask.target_agent,
      action_taken: existingTask.capability + ".cancelled",
      resource_touched: existingTask.target_agent,
      policy_checks: ["cancellation_requested"],
      approval_used: undefined,
      timestamp: new Date().toISOString(),
      result_hash: "sha256:" + taskId + ":cancel",
    };

    const signature = signReceipt(unsignedReceipt);
    const receipt: MapExecutionReceipt = { ...unsignedReceipt, signature };

    this.taskStore.update(taskId, {
      status: result.status,
      result,
      receipt,
    });

    return { result, receipt };
  }

  private evaluatePolicy(
    envelope: TaskEnvelope,
    capability: string
  ): { action: "allow" | "deny" | "require_approval"; reason?: string; policy_checks: string[] } {
    const intent = mapEnvelopeToIntent(envelope, capability);
    const normalizedIntent = coreNormalize(intent);
    const decision = coreEvaluatePolicy(normalizedIntent, this.policy);

    return {
      action: decision.action,
      reason: decision.reason,
      policy_checks: decision.matched_rule ? [`Rule: ${decision.matched_rule}`] : ["Default allow"],
    };
  }

  private negotiateInvocation(
    supportedVisibilityModes: string[],
    capabilityDescriptor: CapabilityDescriptor | undefined,
    envelope: TaskEnvelope,
    capability: string,
    requestedSchemaVersion?: string,
    negotiationRequest?: InvocationNegotiationRequest,
  ): InvocationNegotiation | undefined {
    if (!supportedVisibilityModes.includes(envelope.requested_output_mode)) {
      throw new Error(
        `Unsupported output mode for ${capability}: ${envelope.requested_output_mode}`,
      );
    }

    const schemaResolution = this.negotiateSchemaVersion(
      capabilityDescriptor,
      capability,
      negotiationRequest?.schema_version ?? requestedSchemaVersion,
    );

    return {
      requested: {
        schema_version: schemaResolution.requested,
        output_mode: envelope.requested_output_mode,
        delivery_mode: (envelope.metadata?.async === true || negotiationRequest?.delivery_mode === "async") ? "async" : "sync",
      },
      selected: {
        schema_version: schemaResolution.executed,
        output_mode: envelope.requested_output_mode,
        delivery_mode: (envelope.metadata?.async === true || negotiationRequest?.delivery_mode === "async") ? "async" : "sync",
      },
      ...(schemaResolution.providerActions
        ? { provider_actions: schemaResolution.providerActions }
        : {}),
    };
  }

  private negotiateSchemaVersion(
    capabilityDescriptor: CapabilityDescriptor | undefined,
    capability: string,
    requestedSchemaVersion?: string,
  ): {
    requested?: string;
    executed?: string;
    providerActions?: Array<"schema_translated">;
  } {
    if (!capabilityDescriptor) {
      return {
        requested: requestedSchemaVersion,
        executed: requestedSchemaVersion,
      };
    }

    const supportedVersions =
      capabilityDescriptor.supported_schema_versions ?? [];
    const preferredVersion =
      capabilityDescriptor.preferred_schema_version ??
      capabilityDescriptor.schema_version;

    if (!requestedSchemaVersion) {
      return {
        requested: preferredVersion,
        executed: preferredVersion,
      };
    }

    const translationTarget = capabilityDescriptor.translation_targets?.find(
      (item) => item.from === requestedSchemaVersion,
    );

    if (translationTarget) {
      return {
        requested: requestedSchemaVersion,
        executed: translationTarget.to,
        providerActions: ["schema_translated"],
      };
    }

    if (supportedVersions.length === 0 || supportedVersions.includes(requestedSchemaVersion)) {
      return {
        requested: requestedSchemaVersion,
        executed: requestedSchemaVersion,
      };
    }

    throw new Error(
      `Unsupported schema version for ${capability}: ${requestedSchemaVersion}`,
    );
  }

  private normalizeCoreResult(
    coreResult: ExecutionResult | ECPCoreExecutionReceipt,
    envelope: TaskEnvelope,
    capability: string,
    negotiation?: InvocationNegotiation,
  ): InvokeResult {
    const isECPReceipt = "action" in coreResult && coreResult.action !== undefined;
    if (isECPReceipt) {
      const receipt = coreResult as ECPCoreExecutionReceipt;
      const status =
        receipt.action === "approval_required"
          ? "awaiting_approval"
          : receipt.action === "executed"
            ? "completed"
            : "denied";
      const result: ResultPackage = {
        task_id: envelope.task_id,
        context_id: envelope.context_id,
        status: status as any,
        summary: `Execution ${receipt.action}: ${receipt.status}`,
        structured_output: { capability },
        negotiated_schema_version: negotiation?.selected?.schema_version,
        requested_schema_version: negotiation?.requested?.schema_version,
        executed_schema_version: negotiation?.selected?.schema_version,
        negotiation,
        followup_required: receipt.action === "approval_required",
        redactions_applied: ["credentials", "internal_reasoning"],
      };
      const unsignedReceipt: Omit<MapExecutionReceipt, "signature"> = {
        receipt_id: `${receipt.receipt_id}:${randomUUID()}`,
        task_id: envelope.task_id,
        tenant_id: envelope.requester_identity.tenant_id,
        request_id:
          typeof envelope.metadata?.request_id === "string"
            ? envelope.metadata.request_id
            : undefined,
        agent_id: envelope.target_agent,
        action_taken: `${capability}.${receipt.action}`,
        resource_touched: envelope.target_agent,
        policy_checks: ["core_executed"],
        timestamp: receipt.timestamp,
        result_hash: `sha256:${envelope.task_id}:${receipt.action}`,
        requested_schema_version: negotiation?.requested?.schema_version,
        executed_schema_version: negotiation?.selected?.schema_version,
        negotiation,
      };
      const signature = signReceipt(unsignedReceipt);
      const signedReceipt: MapExecutionReceipt = { ...unsignedReceipt, signature };
      return { result, receipt: signedReceipt };
    }

    const execResult = coreResult as ExecutionResult;
    const taskStatus = execResult.status === "ok" ? "completed" : "failed";

    const result: ResultPackage = {
      task_id: envelope.task_id,
      context_id: envelope.context_id ?? execResult.intent_id,
      status: taskStatus as any,
      summary: execResult.summary,
      structured_output: this.enrichStructuredOutput(execResult.output, envelope),
      negotiated_schema_version: negotiation?.selected?.schema_version,
      requested_schema_version: negotiation?.requested?.schema_version,
      executed_schema_version: negotiation?.selected?.schema_version,
      negotiation,
      followup_required: false,
      redactions_applied: ["credentials", "internal_reasoning"],
    };

    const unsignedReceipt: Omit<MapExecutionReceipt, "signature"> = {
      receipt_id: `receipt:${envelope.task_id}:${Date.now()}:${randomUUID()}`,
      task_id: envelope.task_id,
      tenant_id: envelope.requester_identity.tenant_id,
      request_id:
        typeof envelope.metadata?.request_id === "string"
          ? envelope.metadata.request_id
          : undefined,
      agent_id: envelope.target_agent,
      action_taken: `${capability}.${taskStatus}`,
      resource_touched: envelope.target_agent,
      policy_checks: ["core_executed"],
      timestamp: new Date().toISOString(),
      result_hash: `sha256:${envelope.task_id}:${taskStatus}`,
      requested_schema_version: negotiation?.requested?.schema_version,
      executed_schema_version: negotiation?.selected?.schema_version,
      negotiation,
    };
    const signature = signReceipt(unsignedReceipt);
    const receipt: MapExecutionReceipt = { ...unsignedReceipt, signature };

    return { result, receipt };
  }

  private enrichStructuredOutput(
    output: Record<string, unknown>,
    envelope: TaskEnvelope,
  ): Record<string, unknown> {
    const common =
      envelope.constraints.common &&
      typeof envelope.constraints.common === "object" &&
      !Array.isArray(envelope.constraints.common)
        ? (envelope.constraints.common as Record<string, unknown>)
        : {};
    const domain =
      envelope.constraints.domain &&
      typeof envelope.constraints.domain === "object" &&
      !Array.isArray(envelope.constraints.domain)
        ? (envelope.constraints.domain as Record<string, unknown>)
        : {};

    return {
      ...output,
      ...(common.environment !== undefined ? { environment: common.environment } : {}),
      ...(domain.dataset !== undefined ? { dataset: domain.dataset } : {}),
      ...(domain.service !== undefined ? { service: domain.service } : {}),
    };
  }

  private async waitForStoredResult(taskId: string): Promise<InvokeResult> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const record = this.taskStore.get(taskId);
      if (record?.result && record.receipt && record.status !== "accepted") {
        return {
          result: record.result,
          receipt: record.receipt,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    throw new Error(`Timed out waiting for task completion: ${taskId}`);
  }

  private buildUnsignedReceipt(
    envelope: TaskEnvelope,
    descriptor: { agent_id: string; domain: string },
    capability: string,
    actionTaken: string,
    decision: { policy_checks: string[]; approval_reference?: string }
  ): Omit<MapExecutionReceipt, "signature"> {
    return {
      receipt_id: `receipt:${envelope.task_id}:${Date.now()}:${randomUUID()}`,
      task_id: envelope.task_id,
      tenant_id: this.resolveTenantId(envelope.requester_identity.tenant_id),
      request_id:
        typeof envelope.metadata?.request_id === "string"
          ? envelope.metadata.request_id
          : undefined,
      agent_id: descriptor.agent_id,
      action_taken: actionTaken,
      resource_touched: descriptor.domain,
      policy_checks: decision.policy_checks,
      approval_used: decision.approval_reference,
      timestamp: new Date().toISOString(),
      result_hash: `sha256:${envelope.task_id}:${actionTaken}`,
    };
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
        `Capability not supported by target agent ${targetAgent}: ${capability}`,
      );
    }
    const capabilityDescriptor = this.registry.getCapabilityDescriptor(
      targetAgent,
      capability,
    );
    if (capabilityDescriptor?.status === "disabled") {
      throw new Error(
        `Capability is disabled for target agent ${targetAgent}: ${capability}`,
      );
    }

    return descriptor;
  }

  private resolveTenantId(tenantId: string | undefined): string {
    return tenantId && tenantId.trim().length > 0 ? tenantId : "default";
  }

  private resolveIdempotencyKey(envelope: TaskEnvelope): string | undefined {
    const value = envelope.metadata?.idempotency_key;
    return typeof value === "string" && value.trim().length > 0
      ? value
      : undefined;
  }

  private notifyWebhook(
    envelope: TaskEnvelope,
    taskResult?: {
      status: string;
      summary?: string;
      structured_output?: Record<string, unknown>;
    },
  ): void {
    const webhookUrl = envelope.metadata?.webhook_url;
    if (typeof webhookUrl !== "string" || webhookUrl.trim().length === 0)
      return;

    const payload = {
      task_id: envelope.task_id,
      order_id: envelope.order_id,
      status: taskResult?.status ?? "unknown",
      summary: taskResult?.summary,
      structured_output: taskResult?.structured_output,
      timestamp: new Date().toISOString(),
    };

    void this.deliverWebhookWithRetry(webhookUrl, payload, envelope.task_id);
  }

  private async deliverWebhookWithRetry(
    webhookUrl: string,
    payload: Record<string, unknown>,
    taskId: string,
  ): Promise<void> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          console.error(
            `MAP webhook delivery failed for task ${taskId} after ${attempt} attempts:`,
            err,
          );
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * 2 ** (attempt - 1)),
        );
      }
    }
  }
}
