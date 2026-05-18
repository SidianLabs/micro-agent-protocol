/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it as baseIt,
  type TestContext,
} from "node:test";

const BASE_URL = "http://localhost:8787";

let serverAvailability: Promise<boolean> | undefined;

async function isServerReachable(): Promise<boolean> {
  if (!serverAvailability) {
    serverAvailability = fetch(new URL("/health", BASE_URL))
      .then((response) => response.ok)
      .catch(() => false);
  }
  return serverAvailability;
}

type AsyncTestFn = (t: TestContext) => void | Promise<void>;

function it(name: string, fn: AsyncTestFn): void {
  baseIt(name, async (t) => {
    if (!(await isServerReachable())) {
      t.skip(`MAP reference server is not running at ${BASE_URL}`);
      return;
    }
    await fn(t);
  });
}

export { describe, it };
