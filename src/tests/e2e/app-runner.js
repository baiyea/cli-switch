const path = require("node:path");
const os = require("node:os");
const { _electron: electron } = require("playwright");

/**
 * Launch Electron app in E2E mode.
 * @param {{ cwd?: string, env?: Record<string, string> }} options
 * @returns {Promise<{ electronApp: import('playwright').ElectronApplication, window: import('playwright').Page }>}
 */
async function launchApp(options = {}) {
  const runId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const tempUserData = path.join(os.tmpdir(), ".cli-switch-e2e", runId);
  const repoRoot = path.resolve(__dirname, "../..");
  const launchEnv = {
    ...process.env,
    APP_E2E: "1",
    APP_E2E_RUN_ID: runId,
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    args: [path.resolve(options.cwd || repoRoot)],
    env: launchEnv,
    cwd: options.cwd || repoRoot,
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return { electronApp, window, runId, tempUserData };
}

async function closeApp({ electronApp }) {
  if (!electronApp) return;
  await electronApp.close();
}

module.exports = { launchApp, closeApp };
