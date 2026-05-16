/**
 * MAP Protocol - Conformance Report Generator
 *
 * Generates a signed JSON report for certification evidence.
 * Reports are structured for auditability and can be verified
 * independently using the conformance_export scope.
 *
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac, randomUUID } from "node:crypto";
import type { SuiteResult } from "./suites/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Serialized check within the conformance report.
 */
export interface ReportCheck {
  /** Check identifier */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Human-readable result message */
  message: string;
  /** Optional structured details */
  details?: Record<string, unknown>;
}

/**
 * Summary statistics for the conformance run.
 */
export interface ReportResults {
  /** Total number of checks executed */
  total: number;
  /** Number of checks that passed */
  passed: number;
  /** Number of checks that failed */
  failed: number;
  /** Number of checks that were skipped */
  skipped: number;
}

/**
 * Options for generating a conformance report.
 */
export interface ReportOptions {
  /** Conformance harness version */
  version: string;
  /** URL of the server under test */
  serverUrl: string;
  /** Deployment profile of the server under test */
  deploymentProfile: "open" | "verified" | "regulated";
  /** Certification level tested */
  certificationLevel: number;
}

/**
 * Full conformance report suitable for certification evidence.
 */
export interface ConformanceReport {
  /** Conformance harness version */
  version: string;
  /** ISO 8601 timestamp of report generation */
  timestamp: string;
  /** URL of the server under test */
  server_url: string;
  /** Deployment profile of the server under test */
  deployment_profile: "open" | "verified" | "regulated";
  /** Certification level tested */
  certification_level: number;
  /** Aggregate result statistics */
  results: ReportResults;
  /** Individual check results from all suites */
  checks: ReportCheck[];
  /** HMAC-SHA256 signature of the report contents (conformance_export scope) */
  signature: string;
  /** Report ID for deduplication */
  report_id: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report Generation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default signing secret for report signatures.
 * In production, this should be injected via environment or config.
 */
const DEFAULT_REPORT_SECRET = "map-conformance-report-signing-key-2026";

/**
 * Generate a signed conformance report from suite results.
 *
 * @param results - Array of suite results from executed conformance suites
 * @param options - Report generation options
 * @returns A signed ConformanceReport
 */
export function generateReport(
  results: SuiteResult[],
  options: ReportOptions,
): ConformanceReport {
  // Collect all checks from all suites
  const allChecks: ReportCheck[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const result of results) {
    for (const check of result.checks) {
      allChecks.push({
        name: check.name,
        passed: check.passed,
        message: check.message,
        details: check.details,
      });
    }
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalSkipped += result.skipped;
  }

  const total = totalPassed + totalFailed + totalSkipped;

  // Build the unsigned report body
  const reportBody = {
    version: options.version,
    timestamp: new Date().toISOString(),
    server_url: options.serverUrl,
    deployment_profile: options.deploymentProfile,
    certification_level: options.certificationLevel,
    results: {
      total,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
    },
    checks: allChecks,
  };

  // Generate report ID
  const reportId = `conformance-report-${randomUUID()}`;

  // Sign the report payload
  const signPayload = JSON.stringify({
    report_id: reportId,
    ...reportBody,
  });

  const secret = process.env.MAP_CONFORMANCE_REPORT_SECRET ?? DEFAULT_REPORT_SECRET;
  const signature = createHmac("sha256", secret)
    .update(signPayload)
    .digest("base64url");

  return {
    ...reportBody,
    report_id: reportId,
    signature: `${signature}`,
  };
}

/**
 * Verify a conformance report's signature.
 *
 * @param report - The report to verify
 * @param secret - The signing secret (defaults to DEFAULT_REPORT_SECRET)
 * @returns Whether the report signature is valid
 */
export function verifyReport(
  report: ConformanceReport,
  secret?: string,
): boolean {
  const { signature, report_id, ...reportBody } = report;

  const signPayload = JSON.stringify({
    report_id,
    ...reportBody,
  });

  const key = secret ?? process.env.MAP_CONFORMANCE_REPORT_SECRET ?? DEFAULT_REPORT_SECRET;
  const expectedSignature = createHmac("sha256", key)
    .update(signPayload)
    .digest("base64url");

  return signature === expectedSignature;
}

/**
 * Merge multiple conformance reports into a composite report.
 * Useful for aggregating results from multiple test runs.
 *
 * @param reports - Array of reports to merge
 * @param options - Report generation options for the merged report
 * @returns A merged and signed ConformanceReport
 */
export function mergeReports(
  reports: ConformanceReport[],
  options: ReportOptions,
): ConformanceReport {
  const allChecks: ReportCheck[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const report of reports) {
    allChecks.push(...report.checks);
    totalPassed += report.results.passed;
    totalFailed += report.results.failed;
    totalSkipped += report.results.skipped;
  }

  const total = totalPassed + totalFailed + totalSkipped;

  const reportBody = {
    version: options.version,
    timestamp: new Date().toISOString(),
    server_url: options.serverUrl,
    deployment_profile: options.deploymentProfile,
    certification_level: Math.max(...reports.map((r) => r.certification_level)),
    results: {
      total,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
    },
    checks: allChecks,
  };

  const reportId = `merged-conformance-report-${randomUUID()}`;
  const signPayload = JSON.stringify({ report_id: reportId, ...reportBody });

  const secret = process.env.MAP_CONFORMANCE_REPORT_SECRET ?? DEFAULT_REPORT_SECRET;
  const signature = createHmac("sha256", secret)
    .update(signPayload)
    .digest("base64url");

  return {
    ...reportBody,
    report_id: reportId,
    signature: `${signature}`,
  };
}
