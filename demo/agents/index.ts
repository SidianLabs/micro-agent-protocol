/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentDescriptor } from "../../src/types.js";
import { PaymentAgent } from "./payment-agent.js";
import { DBReadAgent } from "./dbread-agent.js";

export function createExampleAgents(): AgentDescriptor[] {
  return [new PaymentAgent().descriptor, new DBReadAgent().descriptor];
}

export { PaymentAgent } from "./payment-agent.js";
export { DBReadAgent } from "./dbread-agent.js";
export { GenericMicroAgent } from "./generic-agent.js";
export type { GenericAgentExecutor } from "./generic-agent.js";
