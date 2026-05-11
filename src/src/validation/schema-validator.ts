import { Ajv } from "ajv";
import agentDescriptorSchema from "../../../schemas/agent-descriptor.schema.json" with { type: "json" };
import approvalRequestSchema from "../../../schemas/approval-request.schema.json" with { type: "json" };
import dispatchRequestSchema from "../../../schemas/dispatch-request.schema.json" with { type: "json" };
import delegationTokenSchema from "../../../schemas/delegation-token.schema.json" with { type: "json" };
import executionReceiptSchema from "../../../schemas/execution-receipt.schema.json" with { type: "json" };
import resultPackageSchema from "../../../schemas/result-package.schema.json" with { type: "json" };
import taskEnvelopeSchema from "../../../schemas/task-envelope.schema.json" with { type: "json" };
import type {
  AgentDescriptor,
  ApprovalRequest,
  DelegationToken,
  DispatchRequest,
  ExecutionReceipt,
  ResultPackage,
  TaskEnvelope
} from "../types.js";

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  validateSchema: false,
  removeAdditional: 'all',
  logger: false
});
ajv.addFormat("date-time", {
  validate: (value: string) => !Number.isNaN(Date.parse(value))
});

const validators = {
  agentDescriptor: ajv.compile<AgentDescriptor>(agentDescriptorSchema),
  taskEnvelope: ajv.compile<TaskEnvelope>(taskEnvelopeSchema),
  delegationToken: ajv.compile<DelegationToken>(delegationTokenSchema),
  resultPackage: ajv.compile<ResultPackage>(resultPackageSchema),
  executionReceipt: ajv.compile<ExecutionReceipt>(executionReceiptSchema),
  dispatchRequest: ajv.compile<DispatchRequest>(dispatchRequestSchema),
  approvalRequest: ajv.compile<ApprovalRequest>(approvalRequestSchema)
};

function validationError(errors: unknown): string {
  return ajv.errorsText(errors as Parameters<typeof ajv.errorsText>[0], { separator: "; " });
}

export function validateAgentDescriptor(input: unknown): AgentDescriptor {
  if (!validators.agentDescriptor(input)) {
    throw new Error(`Invalid MAP agent descriptor: ${validationError(validators.agentDescriptor.errors)}`);
  }
  return input as AgentDescriptor;
}

export function validateTaskEnvelope(input: unknown): TaskEnvelope {
  if (!validators.taskEnvelope(input)) {
    throw new Error(`Invalid MAP task envelope: ${validationError(validators.taskEnvelope.errors)}`);
  }
  return input as TaskEnvelope;
}

export function validateDelegationToken(input: unknown): DelegationToken {
  if (!validators.delegationToken(input)) {
    throw new Error(`Invalid MAP delegation token: ${validationError(validators.delegationToken.errors)}`);
  }
  return input as DelegationToken;
}

export function validateResultPackage(input: unknown): ResultPackage {
  if (!validators.resultPackage(input)) {
    throw new Error(`Invalid MAP result package: ${validationError(validators.resultPackage.errors)}`);
  }
  return input as ResultPackage;
}

export function validateExecutionReceipt(input: unknown): ExecutionReceipt {
  if (!validators.executionReceipt(input)) {
    throw new Error(`Invalid MAP execution receipt: ${validationError(validators.executionReceipt.errors)}`);
  }
  return input as ExecutionReceipt;
}

export function validateDispatchRequest(input: unknown): DispatchRequest {
  if (!validators.dispatchRequest(input)) {
    throw new Error(`Invalid MAP dispatch request: ${validationError(validators.dispatchRequest.errors)}`);
  }
  return input as DispatchRequest;
}

export function validateApprovalRequest(input: unknown): ApprovalRequest {
  if (!validators.approvalRequest(input)) {
    throw new Error(`Invalid MAP approval request: ${validationError(validators.approvalRequest.errors)}`);
  }
  return input as ApprovalRequest;
}
