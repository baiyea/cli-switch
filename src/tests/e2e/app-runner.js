const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { _electron: electron } = require('playwright');

const { buildSchemaSql } = require('../../kernel/db/models');
const { buildProviderSettings } = require('./provider-fixture');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function setupDb({
  dbPath,
  projectDir,
  projectId = 'e2e-p1',
  projectName = 'E2EProject',
  defaultProvider = 'claude',
  providerSettings,
  schemaSql,
  seedDb,
}) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(String(schemaSql || buildSchemaSql()));

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(projectId, projectName, projectDir, defaultProvider, now, now);

    if (providerSettings) {
      db.prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)`,
      ).run('provider_startup_settings', JSON.stringify(providerSettings), now);
    }

    if (typeof seedDb === 'function') {
      seedDb({ db, now, projectId, projectDir, dbPath, root: path.dirname(dbPath) });
    }
  } finally {
    db.close();
  }
}

async function launchApp({
  cwd,
  rootPrefix = 'cliswitch-e2e-',
  projectDirName = 'e2e-project',
  projectId = 'e2e-p1',
  projectName = 'E2EProject',
  defaultProvider = 'claude',
  providerSettings = buildProviderSettings(),
  schemaSql,
  seedDb,
  prepareFs,
  envOverrides = {},
  unsetEnvKeys = [],
  showWindow,
  shellPath = '/bin/bash',
} = {}) {
  const externalDbPath = process.env.ZEELIN_DB_PATH;
  const useExternalDb = externalDbPath && fs.existsSync(path.dirname(externalDbPath));

  let root;
  let dbPath;
  let projectDir;

  if (useExternalDb) {
    dbPath = externalDbPath;
    root = path.dirname(dbPath);
    projectDir = path.join(root, projectDirName);
    if (!fs.existsSync(projectDir)) {
      ensureDir(projectDir);
    }
  } else {
    root = fs.mkdtempSync(path.join(os.tmpdir(), rootPrefix));
    dbPath = path.join(root, 'e2e.db');
    projectDir = path.join(root, projectDirName);
    ensureDir(projectDir);

    setupDb({
      dbPath,
      projectDir,
      projectId,
      projectName,
      defaultProvider,
      providerSettings,
      schemaSql,
      seedDb,
    });

    if (typeof prepareFs === 'function') {
      prepareFs({ root, dbPath, projectDir, projectId });
    }
  }

  const launchEnv = {
    ...process.env,
    APP_E2E: '1',
    APP_E2E_SHOW_WINDOW: String(showWindow ?? process.env.APP_E2E_SHOW_WINDOW ?? '0'),
    HOME: root,
    USERPROFILE: root,
    ZEELIN_DB_PATH: dbPath,
    SHELL: shellPath,
    ...envOverrides,
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  for (const key of unsetEnvKeys || []) {
    if (!key) continue;
    delete launchEnv[String(key)];
  }

  const electronApp = await electron.launch({
    args: [cwd || path.resolve(__dirname, '../..')],
    env: launchEnv,
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return { electronApp, window, root, dbPath, projectDir, projectId, isExternalDb: useExternalDb };
}

async function closeApp({ electronApp, root, keepRoot = false, isExternalDb = false } = {}) {
  if (electronApp) {
    try {
      await electronApp.close();
    } catch {}
  }

  if (!keepRoot && root && !isExternalDb) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {}
  }
}

module.exports = {
  launchApp,
  closeApp,
  ensureDir,
  setupDb,
};
