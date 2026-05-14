import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IncomingMessage } from "node:http";

export interface JsonBodyReadResult {
  parsed: unknown;
  raw: string;
}

export function normalizePath(url: string): string {
  return new URL(url, "http://localhost").pathname;
}

export function wantsSignedRequestAuth(req: IncomingMessage): boolean {
  return req.headers["x-map-auth-scheme"] === "signed_request";
}

export function extractTargetAgent(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const envelope = (value as { envelope?: unknown }).envelope;
  if (!envelope || typeof envelope !== "object") {
    return undefined;
  }
  const targetAgent = (envelope as { target_agent?: unknown }).target_agent;
  if (typeof targetAgent !== "string" || targetAgent.trim().length === 0) {
    return undefined;
  }
  return targetAgent;
}

export function extractTenantId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const envelope = (value as { envelope?: unknown }).envelope;
  if (!envelope || typeof envelope !== "object") {
    return undefined;
  }
  const requester = (envelope as { requester_identity?: unknown }).requester_identity;
  if (!requester || typeof requester !== "object") {
    return undefined;
  }
  const tenantId = (requester as { tenant_id?: unknown }).tenant_id;
  if (typeof tenantId !== "string" || tenantId.trim().length === 0) {
    return undefined;
  }
  return tenantId.trim();
}

export function checkWritableFilePath(path?: string): {
  configured: boolean;
  writable: boolean;
  error?: string;
} {
  if (!path) {
    return { configured: false, writable: true };
  }

  try {
    mkdirSync(dirname(path), { recursive: true });
    const probePath = `${path}.probe.${randomUUID()}`;
    writeFileSync(probePath, "ok", "utf8");
    unlinkSync(probePath);
    return { configured: true, writable: true };
  } catch (error) {
    return {
      configured: true,
      writable: false,
      error: error instanceof Error ? error.message : "write_probe_failed"
    };
  }
}

export function isConfigured(path?: string): boolean {
  return typeof path === "string" && path.trim().length > 0;
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function parsePositiveIntOrDefault(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.floor(parsed);
}
