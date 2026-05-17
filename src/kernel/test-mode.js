const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { DB_FILENAME } = require("../shared/app-config.js");

const IS_E2E = process.env.APP_E2E === "1";
const IS_DEV = !!process.env.VITE_DEV_SERVER_URL;

function getAppHomeDir() {
  if (IS_E2E) {
    const runId = process.env.APP_E2E_RUN_ID || String(Date.now());
    return path.join(os.tmpdir(), ".cli-switch-e2e", runId);
  }
  const appId = IS_DEV ? "cli-switch-dev" : "cli-switch";
  return path.join(os.homedir(), `.${appId}`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getDataDir() {
  return getAppHomeDir();
}

function getDbPath() {
  return process.env.ZEELIN_DB_PATH || path.join(getDataDir(), DB_FILENAME);
}

module.exports = { IS_E2E, IS_DEV, getAppHomeDir, getDataDir, getDbPath, ensureDir };
