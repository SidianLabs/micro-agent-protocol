import { createMapServer } from "../src/src/server/index.js";
import { resolveServerOptionsFromEnv } from "../src/src/server/config.js";
import { createExampleAgents } from "./agents/index.js";

const { port, ...serverOptions } = resolveServerOptionsFromEnv();
const server = createMapServer({
  ...serverOptions,
  agents: createExampleAgents(),
});

server.listen(port, () => {
  console.log(
    `MAP demo server listening on http://localhost:${port} with task store ${serverOptions.taskStorePath}, receipt store ${serverOptions.receiptStorePath}, dead-letter store ${serverOptions.deadLetterStorePath} (requireTenant=${String(serverOptions.requireTenant)})`,
  );
});
