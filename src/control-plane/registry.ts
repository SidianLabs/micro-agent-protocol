import type { AgentDescriptor, CapabilityDescriptor } from "../types.js";
import {
  signAgentDescriptor,
  verifyAgentDescriptorSignature,
  verifyTrustDomain,
  getTrustAnchors,
} from "../security/signing.js";
import { validateAgentDescriptor } from "../validation/schema-validator.js";

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDescriptor>();

  register(descriptor: AgentDescriptor): void {
    // Validate trust domain if trust anchors are configured
    const trustAnchors = getTrustAnchors();
    if (trustAnchors.length > 0 && descriptor.domain) {
      if (!verifyTrustDomain(descriptor.domain)) {
        throw new Error(
          `Trust domain "${descriptor.domain}" is not trusted. ` +
            `Agent "${descriptor.agent_id}" cannot be registered.`,
        );
      }
    }

    const signedDescriptor =
      descriptor.descriptor_signature &&
      descriptor.descriptor_key_id &&
      descriptor.descriptor_signature_alg
        ? descriptor
        : {
            ...descriptor,
            ...signAgentDescriptor(descriptor),
          };

    const validated = validateAgentDescriptor(signedDescriptor);
    if (!verifyAgentDescriptorSignature(validated)) {
      throw new Error(
        `Invalid MAP agent descriptor signature for ${validated.agent_id}.`,
      );
    }

    this.agents.set(validated.agent_id, validated);
  }

  get(agentId: string): AgentDescriptor | undefined {
    return this.agents.get(agentId);
  }

  list(): AgentDescriptor[] {
    return [...this.agents.values()];
  }

  findByDomain(domain: string): AgentDescriptor[] {
    return this.list().filter((agent) => agent.domain === domain);
  }

  findByCapability(capability: string): AgentDescriptor[] {
    return this.list().filter((agent) =>
      agent.capabilities.includes(capability),
    );
  }

  getCapabilityDescriptor(
    agentId: string,
    capability: string,
  ): CapabilityDescriptor | undefined {
    return this.get(agentId)?.capability_descriptors?.find(
      (descriptor) => descriptor.name === capability,
    );
  }
}
