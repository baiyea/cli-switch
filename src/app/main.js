const path = require("node:path");
const { app, ipcMain } = require("electron");
const { IS_E2E, getAppHomeDir, ensureDir } = require("../kernel/test-mode");
const { initLogger } = require("../kernel/logger");
const { initDatabase, closeDatabase } = require("../kernel/db/connection");
const { createMainWindow } = require("./create-window");

// ---- Init ----
const log = initLogger();
let mainWindow = null;

function configureAppPaths() {
  const home = getAppHomeDir();
  ensureDir(home);
  app.setPath("userData", home);
}

// ---- IPC Registration ----
// Phase 1: terminal only
function registerAllIpc() {
  const { registerTerminalMain } = require("../features/terminal/feature.main");
  registerTerminalMain();
}

// ---- App Lifecycle ----
app.whenReady().then(() => {
  configureAppPaths();
  initDatabase();
  registerAllIpc();
  mainWindow = createMainWindow();

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
});

app.on("will-quit", () => {
  closeDatabase();
});
