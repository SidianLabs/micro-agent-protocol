/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { createMapServer } from "../src/server/index.js";
import { resolveServerOptionsFromEnv } from "../src/server/config.js";
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
