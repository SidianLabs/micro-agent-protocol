/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const schemasDir = path.join(repoRoot, "schemas");
const outputFile = path.join(repoRoot, "packages", "typescript", "src", "generated-schemas.ts");

const fileNames = (await readdir(schemasDir))
  .filter((fileName) => fileName.endsWith(".schema.json"))
  .sort();

const entries = [];
for (const fileName of fileNames) {
  const raw = await readFile(path.join(schemasDir, fileName), "utf8");
  const parsed = JSON.parse(raw);
  const constantName = toConstName(fileName);
  entries.push({ constantName, parsed, fileName });
}

const source = `${banner()}
${entries
  .map(
    ({ constantName, parsed }) =>
      `export const ${constantName} = ${JSON.stringify(parsed, null, 2)} as const;`
  )
  .join("\n\n")}
`;

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, source, "utf8");

function toConstName(fileName) {
  return fileName
    .replace(/\.schema\.json$/u, "")
    .split(/[^a-zA-Z0-9]+/u)
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.toLowerCase() : `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`
    )
    .join("") + "Schema";
}

function banner() {
  return `/**
 * This file is generated from /schemas/*.schema.json.
 * Do not edit it by hand.
 */
`;
}
