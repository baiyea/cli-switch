#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "pages");

function walk(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, fn);
    else fn(f);
  }
}

let count = 0;
walk(DIR, (filePath) => {
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  const orig = content;

  // Calculate depth of this file relative to src/pages/
  const rel = path.relative(DIR, filePath);
  const depth = rel.split(path.sep).length;

  // Replace imports to shared/bridge (need depth-dependent levels)
  // From features/terminal/renderer/X → ../../../shared → was 3 levels
  // From pages/home/terminal/renderer/X → ../../../../shared → needs 4 levels
  // The fix: add one more ../ for each level deeper in pages vs features

  // Fix: ../shared/bridge/XXX or ../../shared/bridge/XXX need depth adjustment
  // Simple heuristic: replace all "../shared/" with the correct number of levels
  // based on file position in pages/ directory tree

  // More reliable: manually do a build-and-fix cycle instead of auto-fix

  if (orig !== content) {
    fs.writeFileSync(filePath, content, "utf8");
    count++;
  }
});

console.log(`Fixed ${count} files. Now run pnpm build and fix remaining errors manually.`);
