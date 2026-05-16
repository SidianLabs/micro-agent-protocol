/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DelegationToken, PolicyDecision, RequesterIdentity } from "../types.js";
import { signDelegationToken } from "../security/signing.js";

export interface DelegationRequest {
  subject_agent: string;
  allowed_actions: string[];
  resource_scope: Record<string, unknown>;
  requester_identity: RequesterIdentity;
  policy: PolicyDecision;
  expires_at: string;
}

export class DelegationService {
  constructor(private readonly issuer = "map-delegation-service") {}

  issue(request: DelegationRequest): DelegationToken {
    const scopedConstraints = request.policy.scoped_constraints ?? {};
    const tokenWithoutSignature = {
      issuer: this.issuer,
      subject_agent: request.subject_agent,
      allowed_actions: request.allowed_actions,
      resource_scope: request.resource_scope,
      constraints: {
        common: (scopedConstraints.common ?? {}) as Record<string, unknown>,
        domain: (scopedConstraints.domain ?? {}) as Record<string, unknown>,
        expires_at: request.expires_at
      },
      approval_reference: request.policy.approval_reference,
      requester_identity: request.requester_identity
    };

    return {
      ...tokenWithoutSignature,
      signature: signDelegationToken(tokenWithoutSignature)
    };
  }
}
