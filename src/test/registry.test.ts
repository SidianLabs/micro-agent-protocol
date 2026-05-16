/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry } from "../control-plane/registry.js";
import { EXAMPLE_AGENTS } from "../fixtures/agents.js";
import { verifyAgentDescriptorSignature } from "../security/signing.js";

const paymentAgent = EXAMPLE_AGENTS[0];

test("registry signs descriptors when registering unsigned providers", () => {
  const registry = new AgentRegistry();

  registry.register(paymentAgent);
  const descriptor = registry.get(paymentAgent.agent_id);

  assert.ok(descriptor);
  assert.equal(typeof descriptor?.descriptor_signature, "string");
  assert.equal(descriptor?.descriptor_key_id, "map-dev-key-1");
  assert.equal(descriptor?.descriptor_signature_alg, "HS256");
  assert.equal(verifyAgentDescriptorSignature(descriptor!), true);
});

test("registry rejects tampered signed descriptors", () => {
  const registry = new AgentRegistry();

  registry.register(paymentAgent);
  const signedDescriptor = registry.get(paymentAgent.agent_id);
  assert.ok(signedDescriptor);

  assert.throws(
    () =>
      registry.register({
        ...signedDescriptor!,
        organization: "tampered-corp",
      }),
    /Invalid MAP agent descriptor signature/,
  );
});
