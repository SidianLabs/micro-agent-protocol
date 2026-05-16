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

export type GenericAgentExecutor = (
  envelope: TaskEnvelope,
  token: DelegationToken,
  agent: GenericMicroAgent
) => Promise<InvokeResult>;

export class GenericMicroAgent extends BaseMicroAgent {
  constructor(
    readonly descriptor: AgentDescriptor,
    private readonly executor: GenericAgentExecutor
  ) {
    super();
  }

  protected execute(envelope: TaskEnvelope, token: DelegationToken): Promise<InvokeResult> {
    return this.executor(envelope, token, this);
  }

  buildGenericResult(
    envelope: TaskEnvelope,
    action: string,
    resourceTouched: string,
    structuredOutput: Record<string, unknown>,
    summary?: string,
    approvalReference?: string,
    policyChecks: string[] = ["policy_passed"]
  ): InvokeResult {
    return {
      result: this.buildResult(envelope, "completed", structuredOutput, summary),
      receipt: this.buildReceipt(
        envelope,
        action,
        resourceTouched,
        policyChecks,
        approvalReference
      )
    };
  }
}
