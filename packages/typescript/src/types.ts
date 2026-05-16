/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './generated-map-types.js';

export type {
  ErrorCode,
  ErrorDetails,
  ValidationErrorDetail,
  APIErrorResponse,
} from './errors.js';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  request_id?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination?: {
    limit: number;
    next_cursor: string | number | null;
    total?: number;
  };
}

export interface VersionNegotiation {
  clientVersion: string;
  serverVersion: string;
  selectedVersion: string;
  compatible: boolean;
  negotiationStrategy: 'strict' | 'forward' | 'backward' | 'fallback';
  supportedVersions: string[];
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  return 0;
}

export function isVersionCompatible(
  clientVersion: string,
  serverVersion: string,
  compatibilityMode: 'backward_compatible' | 'forward_compatible' | 'breaking_change' = 'backward_compatible'
): boolean {
  const comparison = compareVersions(clientVersion, serverVersion);
  const [clientMajor] = clientVersion.split('.').map(Number);
  const [serverMajor] = serverVersion.split('.').map(Number);

  switch (compatibilityMode) {
    case 'backward_compatible':
      return clientMajor === serverMajor && comparison >= 0;
    case 'forward_compatible':
      return clientMajor === serverMajor && comparison <= 0;
    case 'breaking_change':
      return clientVersion === serverVersion;
    default:
      return false;
  }
}

export function selectVersion(
  clientVersions: string[],
  serverVersions: string[],
  compatibilityMode: 'backward_compatible' | 'forward_compatible' = 'backward_compatible'
): string | null {
  const sortedClient = [...clientVersions].sort((a, b) => compareVersions(b, a));
  const sortedServer = [...serverVersions].sort((a, b) => compareVersions(b, a));

  for (const clientVer of sortedClient) {
    for (const serverVer of sortedServer) {
      if (isVersionCompatible(clientVer, serverVer, compatibilityMode)) {
        return serverVer;
      }
    }
  }
  return null;
}
