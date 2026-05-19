/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";
import {
  signAuditCheckpoint,
  verifyAuditCheckpointSignature,
  getSignatureKeyId,
} from "../../security/signing.js";
import { persistAuditEvents } from "../state.js";
import type { AuditEvent, AuditCheckpoint } from "../state.js";

export interface AuditManagerOptions {
  auditStorePath?: string;
  auditMaxEvents: number;
  auditCheckpointInterval: number;
  hydratedEvents?: AuditEvent[];
  hydratedCheckpoints?: AuditCheckpoint[];
}

export class AuditManager {
  private readonly auditEvents: AuditEvent[];
  private readonly auditCheckpoints: AuditCheckpoint[];
  private readonly auditMaxEvents: number;
  private readonly auditCheckpointInterval: number;
  private readonly auditStorePath?: string;

  constructor(opts: AuditManagerOptions) {
    this.auditStorePath = opts.auditStorePath;
    this.auditMaxEvents = opts.auditMaxEvents;
    this.auditCheckpointInterval = opts.auditCheckpointInterval;
    this.auditEvents = opts.hydratedEvents ?? [];
    this.auditCheckpoints = opts.hydratedCheckpoints ?? [];
  }

  getEvents(): AuditEvent[] {
    return this.auditEvents;
  }

  getCheckpoints(): AuditCheckpoint[] {
    return this.auditCheckpoints;
  }

  hashAuditEventBase(input: {
    timestamp: string;
    request_id: string;
    code: string;
    message: string;
    method: string;
    route: string;
    tenant_id?: string;
    target_agent?: string;
    chain_index: number;
    prev_event_hash: string;
  }): string {
    const canonical = [
      input.timestamp,
      input.request_id,
      input.code,
      input.message,
      input.method,
      input.route,
      input.tenant_id ?? "",
      input.target_agent ?? "",
      String(input.chain_index),
      input.prev_event_hash,
    ].join("|");
    return createHash("sha256").update(canonical).digest("hex");
  }

  private createAuditCheckpoint(lastEvent: {
    chain_index: number;
    event_hash: string;
  }): void {
    if (lastEvent.chain_index % this.auditCheckpointInterval !== 0) return;
    const checkpoint: AuditCheckpoint = {
      checkpoint_id: `audit-checkpoint:${lastEvent.chain_index}`,
      created_at: new Date().toISOString(),
      last_chain_index: lastEvent.chain_index,
      last_event_hash: lastEvent.event_hash,
      key_id: "",
      signature: "",
    };
    checkpoint.signature = signAuditCheckpoint({
      checkpoint_id: checkpoint.checkpoint_id,
      created_at: checkpoint.created_at,
      last_chain_index: checkpoint.last_chain_index,
      last_event_hash: checkpoint.last_event_hash,
    });
    checkpoint.key_id = getSignatureKeyId(checkpoint.signature) ?? "unknown";
    this.auditCheckpoints.push(checkpoint);
    if (this.auditCheckpoints.length > this.auditMaxEvents) {
      this.auditCheckpoints.splice(0, this.auditCheckpoints.length - this.auditMaxEvents);
    }
  }

  recordAuditEvent(event: {
    timestamp: string;
    request_id: string;
    code: string;
    message: string;
    method: string;
    route: string;
    tenant_id?: string;
    target_agent?: string;
    subject?: string;
  }): void {
    const last = this.auditEvents[this.auditEvents.length - 1];
    const chainIndex = last ? last.chain_index + 1 : 1;
    const prevEventHash = last ? last.event_hash : "GENESIS";
    const eventHash = this.hashAuditEventBase({
      ...event,
      chain_index: chainIndex,
      prev_event_hash: prevEventHash,
    });
    const chainedEvent: AuditEvent = {
      ...event,
      chain_index: chainIndex,
      prev_event_hash: prevEventHash,
      event_hash: eventHash,
    };
    this.auditEvents.push(chainedEvent);
    if (this.auditEvents.length > this.auditMaxEvents) {
      this.auditEvents.splice(0, this.auditEvents.length - this.auditMaxEvents);
    }
    this.createAuditCheckpoint(chainedEvent);
    persistAuditEvents(this.auditStorePath, this.auditEvents, this.auditCheckpoints);
  }

  verifyAuditIntegrity(): {
    ok: boolean;
    errors: string[];
    summary: {
      events_checked: number;
      checkpoints_checked: number;
      latest_chain_index: number;
    };
  } {
    const errors: string[] = [];
    for (let index = 0; index < this.auditEvents.length; index += 1) {
      const current = this.auditEvents[index];
      const expectedIndex = index + 1;
      if (current.chain_index !== expectedIndex) {
        errors.push(
          `event_chain_index_mismatch_at_${index}: expected ${expectedIndex}, got ${current.chain_index}`,
        );
      }
      const expectedPrev =
        index === 0 ? "GENESIS" : this.auditEvents[index - 1].event_hash;
      if (current.prev_event_hash !== expectedPrev) {
        errors.push(`event_prev_hash_mismatch_at_${index}`);
      }
      const expectedHash = this.hashAuditEventBase({
        timestamp: current.timestamp,
        request_id: current.request_id,
        code: current.code,
        message: current.message,
        method: current.method,
        route: current.route,
        tenant_id: current.tenant_id,
        target_agent: current.target_agent,
        chain_index: current.chain_index,
        prev_event_hash: current.prev_event_hash,
      });
      if (current.event_hash !== expectedHash) {
        errors.push(`event_hash_mismatch_at_${index}`);
      }
    }
    for (let index = 0; index < this.auditCheckpoints.length; index += 1) {
      const checkpoint = this.auditCheckpoints[index];
      const checkpointKid = getSignatureKeyId(checkpoint.signature);
      if (checkpointKid !== checkpoint.key_id) {
        errors.push(`checkpoint_key_id_mismatch_at_${index}`);
      }
      const signatureOk = verifyAuditCheckpointSignature(
        {
          checkpoint_id: checkpoint.checkpoint_id,
          created_at: checkpoint.created_at,
          last_chain_index: checkpoint.last_chain_index,
          last_event_hash: checkpoint.last_event_hash,
        },
        checkpoint.signature,
      );
      if (!signatureOk) {
        errors.push(`checkpoint_signature_invalid_at_${index}`);
      }
      const targetEvent = this.auditEvents.find(
        (e) => e.chain_index === checkpoint.last_chain_index,
      );
      if (!targetEvent) {
        errors.push(`checkpoint_missing_chain_index_at_${index}`);
      } else if (targetEvent.event_hash !== checkpoint.last_event_hash) {
        errors.push(`checkpoint_event_hash_mismatch_at_${index}`);
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      summary: {
        events_checked: this.auditEvents.length,
        checkpoints_checked: this.auditCheckpoints.length,
        latest_chain_index:
          this.auditEvents[this.auditEvents.length - 1]?.chain_index ?? 0,
      },
    };
  }
}
