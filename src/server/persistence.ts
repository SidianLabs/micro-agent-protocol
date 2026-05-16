/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Ensure a directory exists, creating parent directories as needed
 * with secure permissions (owner-only).
 */
export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
}

/**
 * Read and parse a JSON file. Returns `undefined` if the file does not exist
 * or cannot be parsed.
 */
export function readJSON<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Write a JSON-serializable value to a file atomically via a temporary
 * rename (best-effort). The destination file is created with mode 0o600
 * (owner read/write only). The parent directory is created with mode 0o700
 * if it does not exist.
 */
export function writeJSON(
  path: string,
  data: unknown,
  options?: { encoding?: BufferEncoding; mode?: number },
): void {
  const encoding = options?.encoding ?? "utf8";
  const mode = options?.mode ?? 0o600;
  ensureDir(path);
  const tempPath = `${path}.tmp.${randomUUID()}`;
  try {
    writeFileSync(tempPath, JSON.stringify(data, null, 2), { encoding, mode });
    renameSync(tempPath, path);
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}

/**
 * Probe whether a file path is writable by creating and removing a temporary
 * file at the same location.  Returns a diagnostic object suitable for health
 * checks.
 */
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
      error: error instanceof Error ? error.message : "write_probe_failed",
    };
  }
}
