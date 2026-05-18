const { test, expect } = require("@playwright/test");
const { _electron: electron } = require("playwright");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

/**
 * Launch Electron app in E2E mode with temp userData and database.
 */
async function launchApp({ cwd } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cliswitch-e2e-"));
  const dbPath = path.join(root, "e2e.db");
  const projectDir = path.join(root, "e2e-project");
  fs.mkdirSync(projectDir, { recursive: true });

  // Set up minimal database
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      default_provider TEXT NOT NULL DEFAULT 'claude',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const providerSettings = {
    providers: {
      claude: {
        defaultProfileId: "e2e-profile",
        enabledProfileId: "e2e-profile",
        profiles: [
          {
            id: "e2e-profile",
            name: "E2E Profile",
            envVars: [{ key: "ANTHROPIC_AUTH_TOKEN", value: "e2e-dummy-token" }]
          }
        ]
      },
      codex: {
        defaultProfileId: "",
        enabledProfileId: "",
        profiles: [{ id: "oauth-login", name: "OAuth 登录", envVars: [] }]
      },
      gemini: {
        defaultProfileId: "",
        enabledProfileId: "",
        profiles: [{ id: "oauth-login", name: "OAuth 登录", envVars: [] }]
      }
    }
  };

  db.prepare(
    `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, ?)`
  ).run("e2e-p1", "E2EProject", projectDir, now, now);

  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)`
  ).run("provider_startup_settings", JSON.stringify(providerSettings), now);

  db.close();

  const launchEnv = {
    ...process.env,
    APP_E2E: "1",
    HOME: root,
    USERPROFILE: root,
    ZEELIN_DB_PATH: dbPath,
    SHELL: "/bin/bash"
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    args: [cwd || path.resolve(__dirname, "../..")],
    env: launchEnv
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return { electronApp, window, root, dbPath };
}

/**
 * Close Electron app and clean up temp directory.
 */
async function closeApp({ electronApp, root } = {}) {
  if (electronApp) {
    try {
      await electronApp.close();
    } catch {
      // App may already be closed
    }
  }
  if (root) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // Cleanup failure is non-fatal
    }
  }
}

module.exports = { test, expect, launchApp, closeApp };
