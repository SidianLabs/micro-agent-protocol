/**
 * Approval Notifier
 *
 * When MAP policy returns `require_approval`, execution stops.
 * This module delivers the approval request to a configured webhook
 * so a human (or automated system) can review and approve/deny.
 *
 * Delivery flow:
 *   Policy → require_approval
 *   → ApprovalNotifier.notify()
 *   → POST to webhook URL with signed payload
 *   → Approver reviews
 *   → Approver calls POST /approve with approval_reference
 *   → MAP re-evaluates → executes → receipt
 *
 * Webhook payload is signed with the MAP signing key so the receiver
 * can verify it came from this MAP instance.
 *
 * Configure:
 *   MAP_APPROVAL_WEBHOOK_URL=https://your-app.com/approvals/incoming
 *
 * Or per-request via envelope metadata.webhook_url
 */

import { createHmac } from "node:crypto";

export interface ApprovalNotification {
  /** Unique ID for this approval request */
  approval_id: string;
  /** The task waiting for approval */
  task_id: string;
  /** The capability that was requested */
  capability: string;
  /** The agent that would execute */
  target_agent: string;
  /** Why approval is required (matched policy rule) */
  reason: string;
  /** The requester identity */
  requester: {
    type: string;
    id: string;
    tenant_id?: string;
  };
  /** Risk classification */
  risk_class?: string;
  /** The input that triggered the approval requirement (redacted of sensitive fields) */
  input_summary: Record<string, unknown>;
  /** ISO timestamp when approval was requested */
  requested_at: string;
  /** URL to POST the approval decision to */
  approve_url: string;
  /** The approval_reference to include when approving */
  approval_reference: string;
  /** HMAC signature of the payload for webhook verification */
  signature: string;
}

export interface ApprovalNotifierOptions {
  /** Default webhook URL. Can be overridden per-notification. */
  defaultWebhookUrl?: string;
  /** The MAP server's base URL (used to construct approve_url) */
  serverBaseUrl?: string;
  /** HMAC secret for signing webhook payloads */
  signingSecret?: string;
  /** Max retries on delivery failure */
  maxRetries?: number;
  /** Retry delay in ms */
  retryDelayMs?: number;
}

export class ApprovalNotifier {
  private readonly defaultWebhookUrl?: string;
  private readonly serverBaseUrl: string;
  private readonly signingSecret: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: ApprovalNotifierOptions = {}) {
    this.defaultWebhookUrl = options.defaultWebhookUrl;
    this.serverBaseUrl = options.serverBaseUrl ?? "http://localhost:8787";
    this.signingSecret =
      options.signingSecret ??
      process.env.MAP_SIGNING_SECRET ??
      "map-dev-secret";
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  /**
   * Notify an approver that a task requires approval.
   * Delivers a signed webhook payload to the configured URL.
   * Non-blocking — fires and forgets with retry.
   */
  notify(params: {
    taskId: string;
    capability: string;
    targetAgent: string;
    reason: string;
    requester: { type: string; id: string; tenant_id?: string };
    riskClass?: string;
    inputSummary: Record<string, unknown>;
    approvalReference: string;
    webhookUrl?: string;
  }): void {
    const webhookUrl = params.webhookUrl ?? this.defaultWebhookUrl;
    if (!webhookUrl) {
      // No webhook configured — log and continue
      console.log(
        `[MAP] Approval required for task ${params.taskId} (${params.capability}) — no webhook configured. ` +
          `Approve via: POST /approve with approval_reference="${params.approvalReference}"`,
      );
      return;
    }

    const approvalId = `approval:${params.taskId}:${Date.now()}`;
    const requestedAt = new Date().toISOString();
    const approveUrl = `${this.serverBaseUrl}/approve`;

    // Build payload without signature first
    const payloadWithoutSig = {
      approval_id: approvalId,
      task_id: params.taskId,
      capability: params.capability,
      target_agent: params.targetAgent,
      reason: params.reason,
      requester: params.requester,
      risk_class: params.riskClass,
      input_summary: this.redactSensitiveFields(params.inputSummary),
      requested_at: requestedAt,
      approve_url: approveUrl,
      approval_reference: params.approvalReference,
    };

    const signature = this.sign(payloadWithoutSig);
    const notification: ApprovalNotification = {
      ...payloadWithoutSig,
      signature,
    };

    // Fire and forget with retry
    this.deliverWithRetry(webhookUrl, notification, this.maxRetries).catch(
      (err) => {
        console.error(
          `[MAP] Approval webhook delivery failed for task ${params.taskId} after ${this.maxRetries} retries:`,
          err instanceof Error ? err.message : err,
        );
      },
    );
  }

  /**
   * Verify a webhook payload signature.
   * Use this in your webhook receiver to confirm the payload came from MAP.
   */
  verify(payload: Omit<ApprovalNotification, "signature">, signature: string): boolean {
    const expected = this.sign(payload);
    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  }

  private sign(payload: Record<string, unknown>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return createHmac("sha256", this.signingSecret)
      .update(canonical)
      .digest("hex");
  }

  private redactSensitiveFields(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const SENSITIVE_KEYS = new Set([
      "password",
      "secret",
      "token",
      "key",
      "credential",
      "auth",
      "authorization",
      "api_key",
      "private_key",
      "card_number",
      "cvv",
      "ssn",
      "account_number",
    ]);

    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        redacted[k] = "[REDACTED]";
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        redacted[k] = this.redactSensitiveFields(v as Record<string, unknown>);
      } else {
        redacted[k] = v;
      }
    }
    return redacted;
  }

  private async deliverWithRetry(
    url: string,
    notification: ApprovalNotification,
    retriesLeft: number,
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-map-event": "approval_required",
          "x-map-approval-id": notification.approval_id,
          "x-map-task-id": notification.task_id,
          "x-map-signature": notification.signature,
        },
        body: JSON.stringify(notification),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      console.log(
        `[MAP] Approval notification delivered for task ${notification.task_id} → ${url}`,
      );
    } catch (err) {
      if (retriesLeft > 0) {
        const delay =
          this.retryDelayMs * (this.maxRetries - retriesLeft + 1);
        console.warn(
          `[MAP] Approval webhook delivery failed, retrying in ${delay}ms (${retriesLeft} retries left):`,
          err instanceof Error ? err.message : err,
        );
        await new Promise((r) => setTimeout(r, delay));
        return this.deliverWithRetry(url, notification, retriesLeft - 1);
      }
      throw err;
    }
  }
}
