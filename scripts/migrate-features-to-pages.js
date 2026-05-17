#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const MOVE_MAP = {
  "features/terminal": "pages/home/terminal",
  "features/sidebar": "pages/home/sidebar",
  "features/file-tree": "pages/home/file-tree",
  "features/providers": "pages/settings/providers",
  "features/archive": "pages/settings/archive",
  "features/about": "pages/settings/about",
  "features/workspace": "pages/home/shared",
};

// 1. Copy files
for (const [from, to] of Object.entries(MOVE_MAP)) {
  const src = path.join(ROOT, "src", from);
  const dest = path.join(ROOT, "src", to);
  if (!fs.existsSync(src)) continue;
  // Remove old pages/ copies first, then copy fresh
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyRecursive(src, dest);
  console.log(`Copied ${from} → ${to}`);
}

// 2. Rename feature.main.js → block.main.js etc.
function walkDir(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, fn);
    else fn(full);
  }
}

walkDir(path.join(ROOT, "src", "pages"), (filePath) => {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath);
  if (name === "feature.main.js") {
    fs.renameSync(filePath, path.join(dir, "block.main.js"));
  } else if (name === "feature.preload.js") {
    fs.renameSync(filePath, path.join(dir, "block.preload.js"));
  } else if (name === "feature.renderer.tsx") {
    fs.renameSync(filePath, path.join(dir, "block.renderer.tsx"));
  }
});

// 3. Fix relative imports
const PAGES_DIR = path.join(ROOT, "src", "pages");
walkDir(PAGES_DIR, (filePath) => {
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;

  // Fix: imports going to other features that have been moved to pages/
  const replacements = [
    // Workspace store imports → pages/home/shared
    [/"\.\.\/workspace\/renderer\/session\.store"/g, '"../../../home/shared/renderer/session.store"'],
    [/'\.\.\/workspace\/renderer\/session\.store'/g, "'../../../home/shared/renderer/session.store'"],
    [/"\.\.\/\.\.\/workspace\/renderer\/session\.store"/g, '"../../../../home/shared/renderer/session.store"'],
    [/'\.\.\/\.\.\/workspace\/renderer\/session\.store'/g, "'../../../../home/shared/renderer/session.store'"],
    // Workspace store
    [/"\.\.\/workspace\/renderer\/workspace\.store"/g, '"../../../home/shared/renderer/workspace.store"'],
    [/'\.\.\/workspace\/renderer\/workspace\.store'/g, "'../../../home/shared/renderer/workspace.store'"],
    // Shared bridge → needs one more .. (pages is deeper than features)
    // But only for files that were in features/ (now moved to pages/)
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Fixed imports: ${path.relative(ROOT, filePath)}`);
  }
});

console.log("\nMigration complete. Run pnpm build to verify.");

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
