/**
 * Version sync script — bumps all packages to the same version.
 * Usage: node scripts/sync-versions.mjs [patch|minor|major]
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, writeFileSync } from "node:fs";

const bump = process.argv[2] ?? "patch";
const root = JSON.parse(readFileSync("package.json", "utf8"));

const parts = root.version.split(".").map(Number);
let major = parts[0];
let minor = parts[1];
let patch = parts[2] ?? 0;
if (bump === "major") {
  major += 1; minor = 0; patch = 0;
} else if (bump === "minor") {
  minor += 1; patch = 0;
} else {
  patch += 1;
}
const next = `${major}.${minor}.${patch}`;

root.version = next;
writeFileSync("package.json", JSON.stringify(root, null, 2) + "\n");

const ts = JSON.parse(readFileSync("packages/typescript/package.json", "utf8"));
ts.version = next;
writeFileSync("packages/typescript/package.json", JSON.stringify(ts, null, 2) + "\n");

const py = readFileSync("packages/python/pyproject.toml", "utf8");
writeFileSync("packages/python/pyproject.toml", py.replace(/^version = ".*"/m, `version = "${next}"`));

const go = readFileSync("packages/go/mapproto/mapproto.go", "utf8");
writeFileSync("packages/go/mapproto/mapproto.go", go.replace(/Version = "v\d+\.\d+\.\d+"/, `Version = "v${next}"`));

console.log(`All packages synced to v${next}`);