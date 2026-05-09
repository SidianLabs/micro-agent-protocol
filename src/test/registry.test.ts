import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry } from "../src/control-plane/registry.js";
import { PaymentAgent } from "../src/runtime/payment-agent.js";
import { verifyAgentDescriptorSignature } from "../src/security/signing.js";

test("registry signs descriptors when registering unsigned providers", () => {
  const registry = new AgentRegistry();
  const paymentAgent = new PaymentAgent();

  registry.register(paymentAgent.descriptor);
  const descriptor = registry.get(paymentAgent.descriptor.agent_id);

  assert.ok(descriptor);
  assert.equal(typeof descriptor?.descriptor_signature, "string");
  assert.equal(descriptor?.descriptor_key_id, "map-dev-key-1");
  assert.equal(descriptor?.descriptor_signature_alg, "HS256");
  assert.equal(verifyAgentDescriptorSignature(descriptor!), true);
});

test("registry rejects tampered signed descriptors", () => {
  const registry = new AgentRegistry();
  const paymentAgent = new PaymentAgent();

  registry.register(paymentAgent.descriptor);
  const signedDescriptor = registry.get(paymentAgent.descriptor.agent_id);
  assert.ok(signedDescriptor);

  assert.throws(
    () =>
      registry.register({
        ...signedDescriptor!,
        organization: "tampered-corp"
      }),
    /Invalid MAP agent descriptor signature/
  );
});
