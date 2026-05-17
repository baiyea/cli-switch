const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) return [];
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

const srcFiles = walk(path.join(root, "src"))
  .filter((filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

const featuresDir = path.join(root, "src", "features");
if (fs.existsSync(featuresDir)) {
  violations.push("src/features still exists; Page Block Capsule keeps page-owned code under src/pages.");
}

for (const filePath of srcFiles) {
  const relative = rel(filePath);
  const source = read(filePath);
  if (/src\/features|['"][^'"]*\.\.\/features|['"][^'"]*features\//.test(source)) {
    violations.push(`${relative}: imports or references src/features`);
  }
  if (/register-feature-(main|preload|renderer)/.test(source) && !relative.includes("register-feature-")) {
    violations.push(`${relative}: imports legacy feature registration`);
  }
  if (/pages\/home\/(terminal|sidebar|file-tree|top-toolbar)\/.*\/renderer\/.*bridge/.test(source)) {
    violations.push(`${relative}: imports another Home block renderer bridge`);
  }
}

if (violations.length > 0) {
  console.error("[architecture] violations found:");
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log("[architecture] ok");
