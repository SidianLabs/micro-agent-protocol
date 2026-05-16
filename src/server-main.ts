/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { createMapServer } from "./server/index.js";
import { resolveServerOptionsFromEnv } from "./server/config.js";

const { port, ...serverOptions } = resolveServerOptionsFromEnv();
const server = createMapServer(serverOptions);

server.listen(port, () => {
  console.log(
    `MAP server listening on http://localhost:${port} with task store ${serverOptions.taskStorePath}, receipt store ${serverOptions.receiptStorePath}, dead-letter store ${serverOptions.deadLetterStorePath} (requireTenant=${String(serverOptions.requireTenant)})`,
  );
});
