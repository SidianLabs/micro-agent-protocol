/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getSignatureKeyId,
  getVerificationKeys,
  getActiveSignatureKeyId,
} from "../../security/signing.js";
import type { AgentDescriptor, ExecutionReceipt } from "../../types.js";
import type { AuditCheckpoint } from "../state.js";

export interface SigningAnomalyDetectorOptions {
  signingRetiringKeyCriticalRatio: number;
  signingUnknownKeyCriticalRatio: number;
}

export class SigningAnomalyDetector {
  private readonly signingRetiringKeyCriticalRatio: number;
  private readonly signingUnknownKeyCriticalRatio: number;

  constructor(opts: SigningAnomalyDetectorOptions) {
    this.signingRetiringKeyCriticalRatio = opts.signingRetiringKeyCriticalRatio;
    this.signingUnknownKeyCriticalRatio = opts.signingUnknownKeyCriticalRatio;
  }

  getEffectiveVerificationKeys(revokedKids: Set<string>) {
    return getVerificationKeys().map((key) =>
      revokedKids.has(key.kid) ? { ...key, status: "revoked" as const } : key,
    );
  }

  collectSigningKeyUsage(input: {
    descriptors: AgentDescriptor[];
    receipts: ExecutionReceipt[];
    checkpoints: AuditCheckpoint[];
  }) {
    const descriptorCounts = input.descriptors.reduce<Record<string, number>>(
      (acc, descriptor) => {
        const keyId =
          typeof descriptor.descriptor_key_id === "string" &&
          descriptor.descriptor_key_id.length > 0
            ? descriptor.descriptor_key_id
            : "unknown";
        acc[keyId] = (acc[keyId] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const receiptCounts = input.receipts.reduce<Record<string, number>>(
      (acc, receipt) => {
        const keyId = getSignatureKeyId(receipt.signature ?? "") ?? "unknown";
        acc[keyId] = (acc[keyId] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const checkpointCounts = input.checkpoints.reduce<Record<string, number>>(
      (acc, checkpoint) => {
        const keyId = checkpoint.key_id || "unknown";
        acc[keyId] = (acc[keyId] ?? 0) + 1;
        return acc;
      },
      {},
    );
    return {
      agent_descriptors_by_key_id: descriptorCounts,
      receipts_by_key_id: receiptCounts,
      audit_checkpoints_by_key_id: checkpointCounts,
    };
  }

  collectSigningAnomalies(
    signingUsage: {
      agent_descriptors_by_key_id: Record<string, number>;
      receipts_by_key_id: Record<string, number>;
      audit_checkpoints_by_key_id: Record<string, number>;
    },
    revokedKids: Set<string>,
  ) {
    const verificationKeys = this.getEffectiveVerificationKeys(revokedKids);
    const retiringKeyIds = new Set(
      verificationKeys
        .filter((key) => key.status === "retiring")
        .map((key) => key.kid),
    );
    const allUsageEntries = [
      ...Object.entries(signingUsage.agent_descriptors_by_key_id),
      ...Object.entries(signingUsage.receipts_by_key_id),
      ...Object.entries(signingUsage.audit_checkpoints_by_key_id),
    ];

    const unknownKeyUsageDetected = allUsageEntries.some(
      ([keyId, count]) => keyId === "unknown" && Number(count) > 0,
    );
    const retiringKeyUsageDetected = allUsageEntries.some(
      ([keyId, count]) => retiringKeyIds.has(keyId) && Number(count) > 0,
    );
    const totalSignaturesAnalyzed = allUsageEntries.reduce(
      (acc, [, count]) => acc + Number(count),
      0,
    );
    const unknownKeyUsageCount = allUsageEntries.reduce(
      (acc, [keyId, count]) => acc + (keyId === "unknown" ? Number(count) : 0),
      0,
    );
    const retiringKeyUsageCount = allUsageEntries.reduce(
      (acc, [keyId, count]) =>
        acc + (retiringKeyIds.has(keyId) ? Number(count) : 0),
      0,
    );
    const unknownKeyUsageRatio =
      totalSignaturesAnalyzed > 0
        ? unknownKeyUsageCount / totalSignaturesAnalyzed
        : 0;
    const retiringKeyUsageRatio =
      totalSignaturesAnalyzed > 0
        ? retiringKeyUsageCount / totalSignaturesAnalyzed
        : 0;
    const unknownKeyRatioExceeded =
      unknownKeyUsageDetected &&
      unknownKeyUsageRatio > this.signingUnknownKeyCriticalRatio;
    const retiringKeyRatioExceeded =
      retiringKeyUsageDetected &&
      retiringKeyUsageRatio > this.signingRetiringKeyCriticalRatio;

    const severity: "ok" | "warning" | "critical" =
      unknownKeyRatioExceeded || retiringKeyRatioExceeded
        ? "critical"
        : retiringKeyUsageDetected
          ? "warning"
          : "ok";

    const recommendedAction =
      severity === "critical"
        ? "Investigate unknown signing key usage immediately and rotate active keys if compromise is suspected."
        : severity === "warning"
          ? "Monitor retiring key usage and complete signing key migration to active keys."
          : "No action required.";

    return {
      unknown_key_usage_detected: unknownKeyUsageDetected,
      retiring_key_usage_detected: retiringKeyUsageDetected,
      unknown_key_usage_ratio: unknownKeyUsageRatio,
      retiring_key_usage_ratio: retiringKeyUsageRatio,
      total_signatures_analyzed: totalSignaturesAnalyzed,
      thresholds: {
        unknown_key_critical_ratio: this.signingUnknownKeyCriticalRatio,
        retiring_key_critical_ratio: this.signingRetiringKeyCriticalRatio,
      },
      threshold_breaches: {
        unknown_key_ratio_exceeded: unknownKeyRatioExceeded,
        retiring_key_ratio_exceeded: retiringKeyRatioExceeded,
      },
      severity,
      recommended_action: recommendedAction,
    };
  }

  evaluateDeploymentProfile(opts: {
    deploymentProfile: "open" | "verified" | "regulated";
    enforceSignedRequests?: boolean;
    requireTenant?: boolean;
    revokedKids: Set<string>;
  }) {
    const violations: string[] = [];
    const verificationKeys = this.getEffectiveVerificationKeys(opts.revokedKids);
    const signableKeys = verificationKeys.filter(
      (key) => key.status !== "revoked",
    );
    const activeKid = getActiveSignatureKeyId();
    const activeSignableKey =
      activeKid && activeKid.trim().length > 0
        ? signableKeys.find((key) => key.kid === activeKid)
        : undefined;

    if (opts.deploymentProfile === "verified" || opts.deploymentProfile === "regulated") {
      if (opts.enforceSignedRequests !== true) {
        violations.push("signed_requests_not_enforced");
      }
      if (!activeSignableKey) {
        violations.push("active_signing_key_missing");
      }
      if (signableKeys.some((key) => key.demo_only)) {
        violations.push("demo_signing_keys_present");
      }
      if (!activeSignableKey || activeSignableKey.alg !== "RS256") {
        violations.push("active_key_not_rs256");
      }
      if (signableKeys.some((key) => key.alg !== "RS256")) {
        violations.push("non_asymmetric_signing_keys_present");
      }
    }
    if (opts.deploymentProfile === "regulated") {
      if (opts.requireTenant !== true) {
        violations.push("tenant_required_not_enforced");
      }
    }

    return {
      profile: opts.deploymentProfile,
      compliant: violations.length === 0,
      violations,
    };
  }
}
