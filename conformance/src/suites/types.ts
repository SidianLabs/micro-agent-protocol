/**
 * MAP Protocol - Conformance Suite Types
 *
 * Shared types for all conformance suite implementations.
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A single check within a conformance suite.
 */
export interface SuiteCheck {
  /** Human-readable check name/identifier */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Descriptive message about the check result */
  message: string;
  /** Optional structured details about the check */
  details?: Record<string, unknown>;
}

/**
 * Options passed to each suite's run() function.
 */
export interface SuiteOptions {
  /** MAP server base URL (default: http://localhost:8787) */
  baseUrl: string;
  /** Deployment profile being tested (open | verified | regulated) */
  profile: "open" | "verified" | "regulated";
  /** Timeout per request in milliseconds */
  timeout: number;
  /** Names of checks to skip */
  skip: string[];
  /** Names of checks to run exclusively (if non-empty) */
  only: string[];
}

/**
 * Result returned by each suite's run() function.
 */
export interface SuiteResult {
  /** Suite identifier */
  suite: string;
  /** Human-readable description of the suite */
  description: string;
  /** Certification level (1, 2, or 3) */
  certificationLevel: number;
  /** Number of checks that passed */
  passed: number;
  /** Number of checks that failed */
  failed: number;
  /** Number of checks that were skipped */
  skipped: number;
  /** Error messages from failed checks */
  errors: string[];
  /** Individual check results */
  checks: SuiteCheck[];
}
