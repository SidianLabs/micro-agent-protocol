import type { MicroAgent } from "../../src/runtime/micro-agent.js";
import { DBReadAgent } from "./dbread-agent.js";
import { PaymentAgent } from "./payment-agent.js";

export function createExampleAgents(): MicroAgent[] {
  return [new PaymentAgent(), new DBReadAgent()];
}

export { PaymentAgent } from "./payment-agent.js";
export { DBReadAgent } from "./dbread-agent.js";
export { GenericMicroAgent } from "./generic-agent.js";
export type { GenericAgentExecutor } from "./generic-agent.js";
