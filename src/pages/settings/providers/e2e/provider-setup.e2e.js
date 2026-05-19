const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const dotenv = require('dotenv');
const { DatabaseSync } = require('node:sqlite');

// 加载 DeepSeek token
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
const DEEPSEEK_TOKEN = String(process.env.TEST_DEEPSEEK || '').trim();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupDb(dbPath, projectDir) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
      default_provider TEXT NOT NULL DEFAULT 'claude', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, ?)`,
  ).run('p1', 'DemoProject', projectDir, now, now);

  // 预配置 Claude DeepSeek — 含占位 key，让 Provider Guard 通过
  // 测试随后用真实 key 替换
  const providerSettings = {
    providers: {
      claude: {
        defaultProfileId: 'deepseek-api',
        enabledProfileId: 'deepseek-api',
        profiles: [
          {
            id: 'deepseek-api',
            name: 'DeepSeek API',
            envVars: [
              { key: 'ANTHROPIC_AUTH_TOKEN', value: 'e2e-placeholder' },
              { key: 'ANTHROPIC_BASE_URL', value: 'https://api.deepseek.com/anthropic' },
              { key: 'ANTHROPIC_MODEL', value: 'deepseek-v4-pro[1m]' },
            ],
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
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)`,
  ).run('provider_startup_settings', JSON.stringify(providerSettings), now);
  db.close();
}

async function launchApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-provider-setup-'));
  const dbPath = path.join(root, 'e2e.db');
  const projectDir = path.join(root, 'project-a');
  ensureDir(projectDir);
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

test('配置 DeepSeek 作为默认 Provider', async () => {
  if (!DEEPSEEK_TOKEN) {
    console.log('[e2e] TEST_DEEPSEEK not set in .env, skipping provider setup test');
    return;
  }

  const { app, win } = await launchApp();

  // Provider 已在 DB 中预配置。等待 HomePage 加载
  // 如果显示 WelcomeView，点击创建项目
  await win.waitForTimeout(3000);
  const hasCreateMain = await win.locator('.project-create-main').count();
  if (hasCreateMain > 0) {
    await win.locator('.project-create-main').first().click({ force: true });
    await win.waitForTimeout(1500);
  }

  // 1. 打开 Settings
  const settingsBtn = win.locator('.sidebar-settings-btn').first();
  await expect(settingsBtn).toBeVisible({ timeout: 30000 });
  await settingsBtn.click();
  await expect(win.locator('.settings-modal')).toBeVisible({ timeout: 10000 });

  // 2. 确认在 providers 页面，Claude Code tab 已选中
  await expect(win.locator('.settings-modal')).toBeVisible();

  // 3. 替换 ANTHROPIC_AUTH_TOKEN 为真实 key
  // 找到 ANTHROPIC_AUTH_TOKEN 的输入框并填入真实 token
  const envRows = win.locator('.provider-settings-section .space-y-2 > div');
  // 遍历所有输入框，找到 AUTH_TOKEN 旁边的 value 输入
  const allTextInputs = win.locator('.provider-settings-section input[type="text"]');
  const inputCount = await allTextInputs.count();
  let filled = false;
  for (let i = 0; i < inputCount; i++) {
    const input = allTextInputs.nth(i);
    const placeholder = await input.getAttribute('placeholder');
    // ANTHROPIC_AUTH_TOKEN 的 placeholder 通常包含 "token" 或 "key" 或为空
    const val = await input.inputValue();
    if (val === 'e2e-placeholder') {
      await input.fill(DEEPSEEK_TOKEN);
      filled = true;
      break;
    }
  }
  if (!filled) {
    // fallback: 填第一个可见的 text input
    const firstInput = allTextInputs.first();
    await firstInput.fill(DEEPSEEK_TOKEN);
  }
  await sleep(300);

  // 4. 保存
  const saveBtn = win.getByRole('button', { name: '保存' });
  await saveBtn.click();
  await sleep(800);

  // 验证保存成功
  await expect(win.locator('text=已保存').first()).toBeVisible({ timeout: 5000 });

  console.log('[e2e] DeepSeek provider configured successfully');

  await app.close();
});
