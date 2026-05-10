import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourceFile = path.join(repoRoot, "protocol", "map-types.ts");
const outputFile = path.join(repoRoot, "packages", "typescript", "src", "generated-map-types.ts");

const source = await readFile(sourceFile, "utf8");
const generated = `/**
 * This file is generated from /protocol/map-types.ts.
 * Do not edit it by hand.
 */

${source}`;

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, generated, "utf8");
