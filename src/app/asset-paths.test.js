const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { resolveAssetPathFrom } = require("./asset-paths");

test("resolveAssetPathFrom resolves app icons from src/app to src/assets", () => {
  const appDir = path.resolve(__dirname);
  const iconPath = resolveAssetPathFrom(appDir, "app-icons", "mac", "dock-icon.png");
  assert.equal(iconPath, path.resolve(__dirname, "..", "assets", "app-icons", "mac", "dock-icon.png"));
  assert.equal(fs.existsSync(iconPath), true);
});
