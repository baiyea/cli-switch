const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function setupDb(dbPath, projectDir, providerSettings) {
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
    CREATE TABLE IF NOT EXISTS session_archives (
      session_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'claude',
      project_id TEXT,
      title TEXT,
      cwd TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, ?)`,
  ).run('p1', 'CodexOAuthProject', projectDir, now, now);

  if (providerSettings) {
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)`,
    ).run('provider_startup_settings', JSON.stringify(providerSettings), now);
  }

  db.close();
}

function buildProviderSettings() {
  return {
    providers: {
      claude: {
        defaultProfileId: 'deepseek-api',
        enabledProfileId: 'deepseek-api',
        profiles: [
          {
            id: 'deepseek-api',
            name: 'DeepSeek API',
            envVars: [
              { key: 'ANTHROPIC_AUTH_TOKEN', value: 'dummy-token-for-e2e' },
              { key: 'ANTHROPIC_BASE_URL', value: 'https://api.deepseek.com/anthropic' },
            ],
          },
        ],
      },
      codex: {
        defaultProfileId: 'oauth-login',
        enabledProfileId: '',
        profiles: [
          {
            id: 'oauth-login',
            name: 'OAuth 登录',
            envVars: [
              { key: 'ZEELIN_AUTH_MODE', value: 'oauth' },
              { key: 'OPENAI_BASE_URL', value: 'https://api.openai.com' },
            ],
          },
        ],
      },
      gemini: {
        defaultProfileId: 'oauth-login',
        enabledProfileId: '',
        profiles: [
          { id: 'oauth-login', name: 'OAuth 登录', envVars: [{ key: 'ZEELIN_AUTH_MODE', value: 'oauth' }] },
        ],
      },
    },
  };
}

async function launchAppWithFixtures(providerSettings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-codex-oauth-'));
  const dbPath = path.join(root, 'e2e.db');
  const projectDir = path.join(root, 'project-a');
  ensureDir(projectDir);
  setupDb(dbPath, projectDir, providerSettings);

  const launchEnv = {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    ZEELIN_DB_PATH: dbPath,
    SHELL: '/bin/bash',
    APP_E2E: '1',
    APP_E2E_SHOW_WINDOW: process.env.APP_E2E_SHOW_WINDOW || '1',
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: [path.resolve(__dirname, '../../../../../')],
    env: launchEnv,
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win, root };
}

async function openProviderSettings(win) {
  const settingsModal = win.locator('.settings-modal');
  if (!(await settingsModal.isVisible())) {
    const settingsButton = win.getByRole('button', { name: /Settings|设置/i }).first();
    await expect(settingsButton).toBeVisible({ timeout: 60000 });
    await settingsButton.click();
  }
  await expect(settingsModal).toBeVisible({ timeout: 60000 });
  await expect(
    win.getByRole('heading', { name: /Providers|Model Provider Settings/i }),
  ).toBeVisible();
}

async function waitUntilCodexEnabled(win, timeoutMs) {
  const enableSwitch = win.getByRole('switch', { name: '启用配置开关' });
  const enabledBadge = win.getByText('已启用').first();
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    if (await enabledBadge.isVisible().catch(() => false)) return;

    try {
      await enableSwitch.click({ timeout: 10000 });
    } catch {}

    try {
      await expect(enabledBadge).toBeVisible({ timeout: 20000 });
      return;
    } catch {}

    await win.waitForTimeout(Math.min(8000, 1500 + attempt * 500));
  }

  throw new Error('Codex OAuth 未在 15 分钟内完成并启用，请确认是否已在浏览器完成登录并授权。');
}

test.describe('Codex OAuth interactive login', () => {
  test.setTimeout(TOTAL_TIMEOUT_MS);

  test('codex oauth login can be started and enabled after manual interaction', async () => {
    test.skip(!!process.env.CI, '该用例需要人工交互，不在 CI 中执行');

    const seededSettings = buildProviderSettings();
    const { app, win, root } = await launchAppWithFixtures(seededSettings);

    try {
      await openProviderSettings(win);

      await win.getByRole('button', { name: 'Codex CLI' }).click();
      const profileSelect = win.getByRole('combobox').first();
      await profileSelect.selectOption('oauth-login');

      await expect(win.getByText('使用 CLI OAuth 登录')).toBeVisible();
      await win.getByRole('button', { name: '获取OAuth登陆链接' }).click();

      await expect(win.getByRole('switch', { name: '启用配置开关' })).toBeVisible();
      await waitUntilCodexEnabled(win, TOTAL_TIMEOUT_MS - 60_000);

      await win.getByRole('button', { name: '保存' }).click();
      await expect(win.getByText('已保存')).toBeVisible({ timeout: 30000 });
    } finally {
      await app.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
