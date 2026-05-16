/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ConformanceContract {
  contract_version: string;
  required_suites: string[];
  required_scripts: string[];
  minimum_expectations: Record<string, { failed_checks: number }>;
}

function run(): void {
  const contractPath = resolve(process.cwd(), "docs/governance/conformance-contract-v1.json");
  const packagePath = resolve(process.cwd(), "package.json");
  const contract = JSON.parse(readFileSync(contractPath, "utf8")) as ConformanceContract;
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};

  const missingScripts = contract.required_scripts.filter((script) => !(script in scripts));
  const missingSuites = contract.required_suites.filter(
    (suite) => !(suite in contract.minimum_expectations)
  );

  const checks = [
    {
      name: "contract_file_loadable",
      ok: typeof contract.contract_version === "string" && contract.contract_version.length > 0
    },
    {
      name: "required_scripts_declared",
      ok: missingScripts.length === 0,
      details: missingScripts
    },
    {
      name: "required_suites_have_expectations",
      ok: missingSuites.length === 0,
      details: missingSuites
    }
  ];

  const failed = checks.filter((c) => !c.ok);
  const summary = {
    suite: "conformance_contract",
    contract_version: contract.contract_version,
    total_checks: checks.length,
    passed_checks: checks.length - failed.length,
    failed_checks: failed.length,
    checks
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run();
