#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const HEADER_TS = `/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */
`;

const HEADER_PY = `# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0
`;

const HEADER_GO = `// MAP Protocol - Micro Agent Protocol
//
// Copyright © 2026 Sidian Labs
// SPDX-License-Identifier: Apache-2.0
`;

const HEADER_YAML = `# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0
`;

const HEADER_MD = `<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->
`;

const HEADER_SH = `#!/bin/bash
# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0
`;

const CURRENT_MARKER = "Copyright © 2026 Sidian Labs";
const OLD_MARKER = "Copyright MAP Protocol Authors";
const OLD_YEAR = "Copyright 2024";

function getHeader(ext) {
  switch (ext) {
    case ".ts": case ".tsx": case ".js": case ".jsx": case ".mjs": case ".cjs": return HEADER_TS;
    case ".py": return HEADER_PY;
    case ".go": return HEADER_GO;
    case ".yml": case ".yaml": return HEADER_YAML;
    case ".sh": return HEADER_SH;
    case ".md": return HEADER_MD;
    default: return null;
  }
}

function fileNeedsUpdate(content, ext) {
  if (!getHeader(ext)) return false;
  return content.includes(OLD_MARKER) || content.includes(OLD_YEAR) || !content.includes(CURRENT_MARKER);
}

function addOrUpdateHeader(content, ext) {
  const header = getHeader(ext);
  if (!header) return content;
  const lines = header.split("\n").filter(l => l.trim());

  // Check if already has new header
  if (content.includes(CURRENT_MARKER)) {
    return content; // already up to date
  }

  // Remove old header if present
  let result = content;
  if (content.includes(OLD_MARKER)) {
    // Find and remove old header block (first /** ... */ or # comment block)
    result = result.replace(/\/\*\*[\s\S]*?\*\/\n?/, "");
    result = result.replace(/^#.*MAP Protocol[\s\S]*?SPDX-License-Identifier.*$/m, "");
    result = result.replace(/^#.*Copyright.*$/m, "");
    result = result.replace(/^#!/m, "#!/");
    result = result.trimStart();
  }

  // Add new header at the top
  return header.trimEnd() + "\n\n" + result;
}

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".docusaurus", "build"]);
const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".yml", ".yaml", ".sh", ".md"]);

function processDir(dir) {
  let count = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        count += processDir(full);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (TS_EXTENSIONS.has(ext) || entry.name === "Makefile") {
        const content = readFileSync(full, "utf8");
        if (fileNeedsUpdate(content, ext)) {
          const updated = addOrUpdateHeader(content, ext);
          writeFileSync(full, updated, "utf8");
          console.log("  Updated:", full);
          count++;
        }
      }
    }
  }
  return count;
}

const target = process.argv[2] || ".";
const n = processDir(target);
console.log(`\nDone. Updated ${n} files.`);