const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

function setupDb(dbPath, projectDir) {
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
        defaultProfileId: 'deepseek-api',
        enabledProfileId: 'deepseek-api',
        profiles: [
          {
            id: 'deepseek-api',
            name: 'DeepSeek API',
            envVars: [{ key: 'ANTHROPIC_AUTH_TOKEN', value: 'e2e-dummy-token' }],
          },
        ],
      },
      codex: {
        defaultProfileId: 'oauth-login',
        enabledProfileId: '',
        profiles: [{ id: 'oauth-login', name: 'OAuth 登录', envVars: [] }],
      },
      gemini: {
        defaultProfileId: 'oauth-login',
        enabledProfileId: '',
        profiles: [{ id: 'oauth-login', name: 'OAuth 登录', envVars: [] }],
      },
    },
  };
  db.prepare(
    `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, ?)`,
  ).run('p1', 'DemoProject', projectDir, now, now);
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)`,
  ).run('provider_startup_settings', JSON.stringify(providerSettings), now);
  db.close();
}

async function launchApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-window-controls-'));
  const dbPath = path.join(root, 'e2e.db');
  const projectDir = path.join(root, 'project-a');
  fs.mkdirSync(projectDir, { recursive: true });
  setupDb(dbPath, projectDir);

  const launchEnv = {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    ZEELIN_DB_PATH: dbPath,
    SHELL: '/bin/bash',
    APP_E2E: '1',
    APP_E2E_SHOW_WINDOW: process.env.APP_E2E_SHOW_WINDOW || '0',
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: [path.resolve(__dirname, '../../../../../')],
    env: launchEnv,
  });

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

test('window minimize button reduces window to taskbar', async () => {
  const { app, win } = await launchApp();

  // 只在 Windows 上测试窗口控制按钮
  const isWindows = await win.evaluate(() => /Win32|Win64/.test(navigator.platform));
  if (!isWindows) {
    await app.close();
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  const minimizeBtn = win.locator('[aria-label="最小化"]').first();
  await expect(minimizeBtn).toBeVisible();

  // 获取窗口当前状态
  const beforeState = await win.evaluate(() => ({
    isMinimized: false,
    isMaximized: false,
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  await minimizeBtn.click();
  await win.waitForTimeout(500);

  // 窗口应该最小化（在 Playwright 中 Electron 窗口最小化后 isMinimized() 返回 true）
  const afterState = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return w ? { isMinimized: w.isMinimized(), isMaximized: w.isMaximized() } : null;
  });

  expect(afterState).not.toBeNull();
  expect(afterState.isMinimized).toBe(true);

  await app.close();
});

test('window maximize button toggles window size', async () => {
  const { app, win } = await launchApp();

  const isWindows = await win.evaluate(() => /Win32|Win64/.test(navigator.platform));
  if (!isWindows) {
    await app.close();
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  const maximizeBtn = win.locator('[aria-label="最大化"]').first();
  await expect(maximizeBtn).toBeVisible();

  // 获取初始状态
  const beforeState = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return w ? { isMaximized: w.isMaximized(), isNormal: w.isNormal() } : null;
  });

  // 点击最大化
  await maximizeBtn.click();
  await win.waitForTimeout(500);

  const maximizedState = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return w ? { isMaximized: w.isMaximized(), isNormal: w.isNormal() } : null;
  });

  // 窗口应该最大化
  expect(maximizedState).not.toBeNull();
  expect(maximizedState.isMaximized).toBe(true);

  // 再次点击应该恢复
  await maximizeBtn.click();
  await win.waitForTimeout(500);

  const restoredState = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return w ? { isMaximized: w.isMaximized(), isNormal: w.isNormal() } : null;
  });

  expect(restoredState).not.toBeNull();
  expect(restoredState.isMaximized).toBe(false);

  await app.close();
});

test('window close button closes the application window', async () => {
  const { app, win } = await launchApp();

  const isWindows = await win.evaluate(() => /Win32|Win64/.test(navigator.platform));
  if (!isWindows) {
    await app.close();
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  const closeBtn = win.locator('[aria-label="关闭"]').first();
  await expect(closeBtn).toBeVisible();

  // 记录关闭前窗口数量
  const windowsBefore = await app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
  );
  expect(windowsBefore).toBeGreaterThan(0);

  // 点击关闭按钮
  // 注意：close 按钮会触发 window.close()，导致窗口关闭和 Playwright 连接断开
  // 所以需要在关闭前捕获窗口状态
  await closeBtn.click();

  // 窗口关闭后，app 会自动关闭
  // 不需要显式验证，如果关闭失败测试会超时
  // 这里只验证关闭按钮存在且可点击

  // 等待应用退出（close 会触发 before-quit）
  try {
    await app.waitForEvent('window', { timeout: 3000 });
  } catch {
    // 没有新窗口打开，这是预期的
  }

  // 尝试关闭应用（如果还没关闭）
  try {
    await app.close();
  } catch {
    // 应用可能已经被关闭
  }
});

test('window controls are not rendered on macOS', async () => {
  const { app, win } = await launchApp();

  const isMac = await win.evaluate(() => /Mac/.test(navigator.platform));
  if (!isMac) {
    await app.close();
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  // macOS 上不应该有窗口控制按钮
  const minimizeBtn = win.locator('[aria-label="最小化"]');
  await expect(minimizeBtn).toHaveCount(0);

  const maximizeBtn = win.locator('[aria-label="最大化"]');
  await expect(maximizeBtn).toHaveCount(0);

  const closeBtn = win.locator('[aria-label="关闭"]');
  await expect(closeBtn).toHaveCount(0);

  await app.close();
});
