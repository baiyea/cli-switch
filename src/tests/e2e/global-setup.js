const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

module.exports = async function globalSetup() {
  const runId = `e2e-${Date.now()}`;
  const tempDir = path.join(os.tmpdir(), ".cli-switch-e2e", runId);
  fs.mkdirSync(tempDir, { recursive: true });

  process.env.__E2E_RUN_ID = runId;
  process.env.__E2E_TEMP_DIR = tempDir;

  return { runId, tempDir };
};
