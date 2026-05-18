/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskEnvelope, TaskConstraints, RequesterIdentity as MapRequesterIdentity } from "../types.js";
import type { Intent, RequesterIdentity, IntentConstraints } from "../core/types.js";

export function mapEnvelopeToIntent(
  envelope: TaskEnvelope,
  capability: string
): Intent {
  const requester = mapRequesterIdentity(envelope.requester_identity);
  const constraints = mapConstraints(envelope.constraints);
  const input = mapIntentInput(envelope, capability);

  return {
    capability,
    input,
    requester,
    constraints,
    metadata: {
      intent_id: envelope.task_id,
      request_id: extractRequestId(envelope),
      webhook_url: extractWebhookUrl(envelope),
    },
    risk_class: envelope.risk_class,
  };
}

function mapRequesterIdentity(mapIdentity: MapRequesterIdentity): RequesterIdentity {
  return {
    type: mapIdentity.type === "agent" ? "service" : mapIdentity.type,
    id: mapIdentity.id,
    tenant_id: mapIdentity.tenant_id,
  };
}

function mapConstraints(constraints: TaskConstraints): IntentConstraints {
  const common = constraints.common ?? {};
  return {
    environment: common.environment as IntentConstraints["environment"],
    timeout_ms: common.timeout_ms as number | undefined,
    max_amount: common.max_amount as number | undefined,
    resource_id: common.resource_id as string | undefined,
  };
}

function mapIntentInput(
  envelope: TaskEnvelope,
  capability: string,
): Record<string, unknown> {
  const parsedInput = parseIntentPayload(envelope.intent);
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

  if (capability.startsWith("payment.")) {
    return {
      ...domain,
      ...parsedInput.data,
      amount: parsedInput.data.amount ?? common.max_amount,
      currency:
        parsedInput.data.currency ??
        common.currency ??
        common.currency_code ??
        "USD",
      vendor_id:
        parsedInput.data.vendor_id ??
        common.resource_id ??
        domain.vendor_id,
      description: parsedInput.data.description ?? parsedInput.summary,
    };
  }

  if (capability.startsWith("db.read.")) {
    const dataset =
      typeof domain.dataset === "string" && domain.dataset.trim().length > 0
        ? domain.dataset
        : "records";
    const service =
      typeof domain.service === "string" && domain.service.trim().length > 0
        ? domain.service
        : undefined;

    return {
      ...domain,
      ...parsedInput.data,
      query:
        parsedInput.data.query ??
        buildDbReadQuery(dataset, service, parsedInput.summary),
      params: parsedInput.data.params ?? (service ? [service] : []),
      limit:
        parsedInput.data.limit ??
        (typeof common.limit === "number" ? common.limit : 25),
      output_mode:
        parsedInput.data.output_mode ??
        mapRequestedOutputMode(envelope.requested_output_mode),
      environment: common.environment,
      dataset,
      service,
    };
  }

  return {
    ...domain,
    ...parsedInput.data,
    ...(parsedInput.summary ? { intent: parsedInput.summary } : {}),
  };
}

function parseIntentPayload(intent: string): {
  data: Record<string, unknown>;
  summary?: string;
} {
  if (!intent || intent.trim() === "") {
    return { data: {} };
  }
  try {
    const parsed = JSON.parse(intent);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown> };
    }
  } catch {
    // Fall back to treating the raw string as a natural language summary.
  }
  return { data: {}, summary: intent.trim() };
}

function mapRequestedOutputMode(
  outputMode: TaskEnvelope["requested_output_mode"],
): "summary" | "structured" | "count_only" {
  switch (outputMode) {
    case "structured_only":
    case "redacted":
      return "structured";
    case "receipt_only":
      return "count_only";
    case "summary":
    case "full":
    default:
      return "summary";
  }
}

function buildDbReadQuery(
  dataset: string,
  service: string | undefined,
  summary: string | undefined,
): string {
  const safeDataset = dataset.replace(/[^a-zA-Z0-9_]/g, "_");
  if (service) {
    return `SELECT * FROM ${safeDataset} WHERE service = $1`;
  }
  if (summary && summary.length > 0) {
    return `SELECT * FROM ${safeDataset} /* ${summary.replace(/\*\//g, "")} */`;
  }
  return `SELECT * FROM ${safeDataset}`;
}

function extractRequestId(envelope: TaskEnvelope): string | undefined {
  const metadataRequestId = envelope.metadata?.request_id;
  if (typeof metadataRequestId === "string") {
    return metadataRequestId;
  }
  return undefined;
}

function extractWebhookUrl(envelope: TaskEnvelope): string | undefined {
  const metadataWebhookUrl = envelope.metadata?.webhook_url;
  if (typeof metadataWebhookUrl === "string") {
    return metadataWebhookUrl;
  }
  return undefined;
}

export function mapResultToExecution(
  coreResult: { intent_id: string; capability: string; status: string; output: Record<string, unknown>; summary: string },
  envelope: TaskEnvelope,
  capability: string
): {
  result: {
    task_id: string;
    context_id?: string;
    status: "completed" | "failed" | "awaiting_approval";
    summary: string;
    structured_output: Record<string, unknown>;
    followup_required: boolean;
  };
  receipt: {
    receipt_id: string;
    intent_id: string;
    capability: string;
    action: "executed" | "denied" | "approval_required";
    status: "ok" | "error";
    task_id: string;
    tenant_id?: string;
    agent_id: string;
    resource_touched: string;
    policy_checks: string[];
    timestamp: string;
    result_hash: string;
    signature: string;
  };
} {
  const taskStatus = coreResult.status === "ok" ? "completed" : "failed";
  const contextId = envelope.context_id ?? coreResult.intent_id;

  const result = {
    task_id: envelope.task_id,
    context_id: contextId,
    status: taskStatus as "completed" | "failed",
    summary: coreResult.summary,
    structured_output: coreResult.output,
    followup_required: false,
  };

  const coreAction = taskStatus === "completed" ? "executed" as const : "denied" as const;
  const coreStatus = coreResult.status === "ok" ? "ok" as const : "error" as const;

  const receipt = {
    receipt_id: `receipt:${envelope.task_id}:${Date.now()}`,
    intent_id: envelope.task_id,
    capability,
    action: coreAction,
    status: coreStatus,
    task_id: envelope.task_id,
    tenant_id: envelope.requester_identity.tenant_id,
    agent_id: envelope.target_agent,
    resource_touched: envelope.target_agent,
    policy_checks: ["policy_passed"],
    timestamp: new Date().toISOString(),
    result_hash: `sha256:${envelope.task_id}:${taskStatus}`,
    signature: "",
  };

  return { result, receipt };
}
