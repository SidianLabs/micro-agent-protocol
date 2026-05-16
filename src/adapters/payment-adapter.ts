/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Payment Adapter
 *
 * Executes payment operations as MAP capabilities.
 * Stripe-compatible interface — works with any payment provider
 * that accepts the same input shape.
 *
 * Capabilities:
 *   payment.execute  — charge a payment method
 *   payment.refund   — refund a previous charge
 *
 * Input for payment.execute:
 *   amount:       number  (required) — amount in smallest currency unit (cents)
 *   currency:     string  (required) — ISO 4217 currency code (USD, EUR, GBP)
 *   vendor_id:    string  (required) — recipient/vendor identifier
 *   description:  string  (optional) — payment description
 *   metadata:     object  (optional) — arbitrary key/value pairs
 *
 * Input for payment.refund:
 *   charge_id:    string  (required) — ID of the charge to refund
 *   amount:       number  (optional) — partial refund amount (full refund if omitted)
 *   reason:       string  (optional) — refund reason
 *
 * Policy example:
 *   { "id": "high-value", "capability": "payment.*",
 *     "condition": { "gt": ["input.amount", 100000] },
 *     "action": "require_approval" }
 *
 * Configure:
 *   MAP_PAYMENT_PROVIDER_URL=https://api.stripe.com/v1
 *   MAP_PAYMENT_API_KEY=sk_live_...
 */

import type {
  ExecutionAdapter,
  ExecutionContext,
  ExecutionResult,
  ValidationResult,
} from "../core/types.js";

export interface PaymentAdapterOptions {
  /**
   * Payment provider base URL.
   * Default: uses MAP_PAYMENT_PROVIDER_URL env var.
   * If neither is set, runs in simulation mode.
   */
  providerUrl?: string;
  /**
   * API key for the payment provider.
   * Default: uses MAP_PAYMENT_API_KEY env var.
   */
  apiKey?: string;
  /**
   * If true, simulate payments without calling the provider.
   * Useful for development and testing.
   */
  simulate?: boolean;
}

abstract class BasePaymentAdapter implements ExecutionAdapter {
  abstract readonly capability: string;

  protected readonly providerUrl: string;
  protected readonly apiKey: string;
  protected readonly simulate: boolean;

  constructor(options: PaymentAdapterOptions = {}) {
    this.providerUrl =
      options.providerUrl ??
      process.env.MAP_PAYMENT_PROVIDER_URL ??
      "https://api.stripe.com/v1";
    this.apiKey =
      options.apiKey ?? process.env.MAP_PAYMENT_API_KEY ?? "";
    this.simulate =
      options.simulate ?? (!this.apiKey || process.env.NODE_ENV === "test");
  }

  abstract validate(input: unknown): ValidationResult;
  abstract execute(
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ExecutionResult>;

  protected async callProvider(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.simulate) {
      return this.simulateResponse(path, body);
    }

    const response = await fetch(`${this.providerUrl}${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": body.idempotency_key as string,
      },
      body: new URLSearchParams(
        Object.entries(body)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)]),
      ).toString(),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        `Payment provider error: ${(data.error as { message?: string })?.message ?? response.statusText}`,
      );
    }
    return data;
  }

  private simulateResponse(
    path: string,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const id = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (path.includes("refund")) {
      return {
        id,
        object: "refund",
        amount: body.amount,
        charge: body.charge,
        currency: "usd",
        status: "succeeded",
        created: Math.floor(Date.now() / 1000),
      };
    }
    return {
      id,
      object: "charge",
      amount: body.amount,
      currency: body.currency ?? "usd",
      description: body.description,
      status: "succeeded",
      paid: true,
      created: Math.floor(Date.now() / 1000),
      metadata: body.metadata ?? {},
    };
  }
}

export class PaymentExecuteAdapter extends BasePaymentAdapter {
  readonly capability = "payment.execute";

  validate(input: unknown): ValidationResult {
    if (!input || typeof input !== "object") {
      return { valid: false, errors: [{ field: "input", message: "Input must be an object." }] };
    }
    const inp = input as Record<string, unknown>;
    const errors: Array<{ field: string; message: string }> = [];

    if (typeof inp.amount !== "number" || inp.amount <= 0) {
      errors.push({ field: "amount", message: "amount must be a positive number (in smallest currency unit, e.g. cents)." });
    }
    if (typeof inp.currency !== "string" || inp.currency.trim().length !== 3) {
      errors.push({ field: "currency", message: "currency must be a 3-letter ISO 4217 code (e.g. USD, EUR)." });
    }
    if (typeof inp.vendor_id !== "string" || inp.vendor_id.trim().length === 0) {
      errors.push({ field: "vendor_id", message: "vendor_id is required." });
    }

    return { valid: errors.length === 0, errors };
  }

  async execute(
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const amount = input.amount as number;
    const currency = (input.currency as string).toLowerCase();
    const vendorId = input.vendor_id as string;
    const description = (input.description as string | undefined) ?? `Payment to ${vendorId}`;

    const chargeData = await this.callProvider("/charges", {
      amount,
      currency,
      description,
      metadata: JSON.stringify({ vendor_id: vendorId, intent_id: context.intent_id }),
      idempotency_key: context.intent_id,
    });

    return {
      intent_id: context.intent_id,
      capability: this.capability,
      status: chargeData.status === "succeeded" ? "ok" : "error",
      output: {
        charge_id: chargeData.id,
        amount: chargeData.amount,
        currency: chargeData.currency,
        status: chargeData.status,
        vendor_id: vendorId,
        simulated: this.simulate,
      },
      summary: `Payment of ${amount} ${currency.toUpperCase()} to ${vendorId}: ${chargeData.status}`,
    };
  }
}

export class PaymentRefundAdapter extends BasePaymentAdapter {
  readonly capability = "payment.refund";

  validate(input: unknown): ValidationResult {
    if (!input || typeof input !== "object") {
      return { valid: false, errors: [{ field: "input", message: "Input must be an object." }] };
    }
    const inp = input as Record<string, unknown>;
    const errors: Array<{ field: string; message: string }> = [];

    if (typeof inp.charge_id !== "string" || inp.charge_id.trim().length === 0) {
      errors.push({ field: "charge_id", message: "charge_id is required." });
    }
    if (inp.amount !== undefined && (typeof inp.amount !== "number" || inp.amount <= 0)) {
      errors.push({ field: "amount", message: "amount must be a positive number if provided." });
    }

    return { valid: errors.length === 0, errors };
  }

  async execute(
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const chargeId = input.charge_id as string;
    const amount = input.amount as number | undefined;
    const reason = (input.reason as string | undefined) ?? "requested_by_customer";

    const refundData = await this.callProvider("/refunds", {
      charge: chargeId,
      ...(amount !== undefined ? { amount } : {}),
      reason,
      idempotency_key: `refund_${context.intent_id}`,
    });

    return {
      intent_id: context.intent_id,
      capability: this.capability,
      status: refundData.status === "succeeded" ? "ok" : "error",
      output: {
        refund_id: refundData.id,
        charge_id: chargeId,
        amount: refundData.amount,
        status: refundData.status,
        simulated: this.simulate,
      },
      summary: `Refund for charge ${chargeId}: ${refundData.status}`,
    };
  }
}
