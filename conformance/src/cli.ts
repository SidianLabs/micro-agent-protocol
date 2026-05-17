/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

#!//usr/bin/env node

import { run as runLevel1 } from "./suites/level1.js";
import { run as runLevel2 } from "./suites/level2.js";
import { run as runLevel3 } from "./suites/level3.js";
import { generateReport, type ConformanceReport } from "./report.js";
import type { SuiteResult, SuiteOptions } from "./suites/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Argument Parsing
// ═══════════════════════════════════════════════════════════════════════════════

function parseArgs(raw: string[]): {
  baseUrl: string;
  level: number;
  profile: "open" | "verified" | "regulated";
  output: "json" | "text";
  timeout: number;
  skip: string[];
  only: string[];
  showHelp: boolean;
  showVersion: boolean;
} {
  const args = {
    baseUrl: "http://localhost:8787",
    level: 1,
    profile: "verified" as "open" | "verified" | "regulated",
    output: "text" as "json" | "text",
    timeout: 30000,
    skip: [] as string[],
    only: [] as string[],
    showHelp: false,
    showVersion: false,
  };

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    const next = raw[i + 1];

    switch (arg) {
      case "--base-url":
        if (next && !next.startsWith("--")) {
          args.baseUrl = next;
          i++;
        }
        break;
      case "--level":
        if (next && !next.startsWith("--")) {
          const lvl = parseInt(next, 10);
          if (lvl === 1 || lvl === 2 || lvl === 3) {
            args.level = lvl;
          }
          i++;
        }
        break;
      case "--profile":
        if (next && !next.startsWith("--")) {
          const profile = next.toLowerCase();
          if (profile === "open" || profile === "verified" || profile === "regulated") {
            args.profile = profile as "open" | "verified" | "regulated";
          }
          i++;
        }
        break;
      case "--output":
        if (next && !next.startsWith("--")) {
          const fmt = next.toLowerCase();
          if (fmt === "json" || fmt === "text") {
            args.output = fmt as "json" | "text";
          }
          i++;
        }
        break;
      case "--timeout":
        if (next && !next.startsWith("--")) {
          const ms = parseInt(next, 10);
          if (!isNaN(ms) && ms > 0) {
            args.timeout = ms;
          }
          i++;
        }
        break;
      case "--skip":
        if (next && !next.startsWith("--")) {
          args.skip.push(next);
          i++;
        }
        break;
      case "--only":
        if (next && !next.startsWith("--")) {
          args.only.push(next);
          i++;
        }
        break;
      case "--help":
      case "-h":
        args.showHelp = true;
        break;
      case "--version":
      case "-v":
        args.showVersion = true;
        break;
      default:
        break;
    }
  }

  return args;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Help Text
// ═══════════════════════════════════════════════════════════════════════════════

function printHelp(): void {
  console.log(`MAP Protocol Conformance Test Harness v2026.05.14

Usage: map-conformance [options]

Options:
  --base-url <url>          MAP server URL (default: http://localhost:8787)
  --level <1|2|3>           Certification level to test (default: 1)
  --profile <profile>       Deployment profile (open|verified|regulated)
  --output <json|text>      Output format (default: text)
  --timeout <ms>            Test timeout in ms (default: 30000)
  --skip <test>             Skip specific test (can repeat)
  --only <test>             Run only specific test (can repeat)
  --help, -h                Show this help
  --version, -v             Show version

Certification Levels:
  1 — Basic Protocol Compliance
  2 — Security Verification
  3 — Production Readiness

Exit codes:
  0 — all tests passed
  1 — one or more tests failed
`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Text Output
// ═══════════════════════════════════════════════════════════════════════════════

function printTextResults(results: SuiteResult[]): void {
  console.log("=".repeat(60));
  console.log("MAP Protocol Conformance Test Results");
  console.log("=".repeat(60));
  console.log("");

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const result of results) {
    console.log(`Suite: ${result.description} (Level ${result.certificationLevel})`);
    console.log(`  Passed:  ${result.passed}`);
    console.log(`  Failed:  ${result.failed}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log("");

    if (result.checks.length > 0) {
      console.log("  Checks:");
      for (const check of result.checks) {
        const status = check.passed ? "PASS" : (check.details?.skipped ? "SKIP" : "FAIL");
        console.log(`    ${status} ${check.name}: ${check.message}`);
      }
      console.log("");
    }

    if (result.errors.length > 0) {
      console.log("  Errors:");
      for (const err of result.errors) {
        console.log(`    ! ${err}`);
      }
      console.log("");
    }

    totalPassed += result.passed;
    totalFailed += result.failed;
    totalSkipped += result.skipped;
  }

  console.log("-".repeat(60));
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
  console.log("-".repeat(60));

  if (totalFailed > 0) {
    console.log("");
    console.log("CONFORMANCE FAILED — some checks did not pass.");
  } else {
    console.log("");
    console.log(" CONFORMANCE PASSED — all checks passed.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.showHelp) {
    printHelp();
    process.exit(0);
  }

  if (args.showVersion) {
    console.log("map-conformance v2026.05.14");
    process.exit(0);
  }

  const suiteOptions: SuiteOptions = {
    baseUrl: args.baseUrl,
    profile: args.profile,
    timeout: args.timeout,
    skip: args.skip,
    only: args.only,
  };

  if (args.output === "text") {
    console.log(`Running conformance tests against ${args.baseUrl}`);
    console.log(`Level: ${args.level}, Profile: ${args.profile}, Timeout: ${args.timeout}ms`);
    console.log("");
  }

  const suites: Array<{
    level: number;
    run: (opts: SuiteOptions) => Promise<SuiteResult>;
  }> = [];

  // Select suites based on certification level
  if (args.level >= 1) suites.push({ level: 1, run: runLevel1 });
  if (args.level >= 2) suites.push({ level: 2, run: runLevel2 });
  if (args.level >= 3) suites.push({ level: 3, run: runLevel3 });

  // Run selected suites
  const results: SuiteResult[] = [];
  for (const suite of suites) {
    try {
      const result = await suite.run(suiteOptions);
      results.push(result);
    } catch (err) {
      results.push({
        suite: `level-${suite.level}`,
        description: `Level ${suite.level} Suite`,
        certificationLevel: suite.level,
        passed: 0,
        failed: 1,
        skipped: 0,
        errors: [`Suite crashed: ${(err as Error).message}`],
        checks: [
          {
            name: "suite-execution",
            passed: false,
            message: `Suite execution failed: ${(err as Error).message}`,
            details: { error: String(err) },
          },
        ],
      });
    }
  }

  // Output results
  if (args.output === "json") {
    const report = generateReport(results, {
      version: "2026.05.14",
      serverUrl: args.baseUrl,
      deploymentProfile: args.profile,
      certificationLevel: args.level,
    });
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextResults(results);
  }

  // Exit code
  const hasFailures = results.some((r) => r.failed > 0);
  process.exit(hasFailures ? 1 : 0);
}

// Execute main
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
