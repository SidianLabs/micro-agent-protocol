import type { MicroAgent } from "./micro-agent.js";
import { DBReadAgent } from "./dbread-agent.js";
import { PaymentAgent } from "./payment-agent.js";

export function createExampleAgents(): MicroAgent[] {
  return [new PaymentAgent(), new DBReadAgent()];
}
