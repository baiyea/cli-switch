const log = require("electron-log");
const path = require("node:path");
const { IS_E2E, getAppHomeDir, ensureDir } = require("./test-mode");

function initLogger() {
  const logsDir = path.join(getAppHomeDir(), "logs");
  ensureDir(logsDir);

  log.transports.file.resolvePathFn = () =>
    path.join(logsDir, "main.log");
  log.transports.file.level = IS_E2E ? "error" : "info";
  log.transports.console.level = IS_E2E ? "error" : "info";

  return log;
}

module.exports = { initLogger };
