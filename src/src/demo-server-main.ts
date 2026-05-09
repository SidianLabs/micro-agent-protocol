import { createMapServer } from "./server.js";
import { resolveServerOptionsFromEnv } from "./server/env.js";

const { port, ...serverOptions } = resolveServerOptionsFromEnv();
const server = createMapServer({
  ...serverOptions,
  includeExampleAgents: true
});

server.listen(port, () => {
  console.log(
    `MAP demo server listening on http://localhost:${port} with task store ${serverOptions.taskStorePath}, receipt store ${serverOptions.receiptStorePath}, dead-letter store ${serverOptions.deadLetterStorePath} (requireTenant=${String(serverOptions.requireTenant)})`
  );
});
