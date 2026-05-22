const path = require('node:path');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

const TOTAL_TIMEOUT_MS = 15 * 60 * 1000;

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
          {
            id: 'oauth-login',
            name: 'OAuth 登录',
            envVars: [{ key: 'ZEELIN_AUTH_MODE', value: 'oauth' }],
          },
        ],
      },
    },
  };
}

async function launchAppWithFixtures(providerSettings) {
  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-gemini-oauth-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'GeminiOAuthProject',
    providerSettings,
    showWindow: process.env.APP_E2E_SHOW_WINDOW || '1',
  });
  return { app: launched.electronApp, win: launched.window, root: launched.root };
}

async function openProviderSettings(win) {
  const settingsModal = win.locator('.settings-modal');
  if (!(await settingsModal.isVisible())) {
    const settingsButton = win.getByRole('button', { name: /Settings|设置/i }).first();
    await expect(settingsButton).toBeVisible({ timeout: 60000 });
    await settingsButton.click();
  }
  await expect(settingsModal).toBeVisible({ timeout: 60000 });
  await expect(win.getByRole('heading', { name: /Providers|Model Provider Settings/i })).toBeVisible();
}

async function waitUntilGeminiEnabled(win, timeoutMs) {
  const enableSwitch = win.getByRole('switch', { name: '启用配置开关' });
  const enabledBadge = win.getByText('已启用').first();
  const codeInput = win.getByPlaceholder('粘贴 Gemini 页面显示的 authorization code');
  const submitCodeButton = win.getByRole('button', { name: '提交验证码' });
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    if (await enabledBadge.isVisible().catch(() => false)) return;

    const hasCodeInput = await codeInput.isVisible().catch(() => false);
    if (hasCodeInput) {
      const codeValue = (await codeInput.inputValue().catch(() => '')).trim();
      if (codeValue) {
        try {
          await submitCodeButton.click({ timeout: 4000 });
        } catch {}
      }
    }

    try {
      await enableSwitch.click({ timeout: 10000 });
    } catch {}

    try {
      await expect(enabledBadge).toBeVisible({ timeout: 20000 });
      return;
    } catch {}

    await win.waitForTimeout(Math.min(8000, 1500 + attempt * 500));
  }

  throw new Error('Gemini OAuth 未在 15 分钟内完成并启用，请确认是否已在浏览器完成登录并将验证码回填到设置页。');
}

test.describe('Gemini OAuth interactive login', () => {
  test.setTimeout(TOTAL_TIMEOUT_MS);

  test('gemini oauth login can be started and enabled after manual interaction', async () => {
    test.skip(!!process.env.CI, '该用例需要人工交互，不在 CI 中执行');

    const seededSettings = buildProviderSettings();
    const { app, win, root } = await launchAppWithFixtures(seededSettings);

    try {
      await openProviderSettings(win);

      await win.getByRole('button', { name: 'Gemini CLI' }).click();
      const profileSelect = win.getByRole('combobox').first();
      await profileSelect.selectOption('oauth-login');

      await expect(win.getByText('使用 CLI OAuth 登录')).toBeVisible();
      await win.getByRole('button', { name: '获取OAuth登陆链接' }).click();

      await expect(win.getByRole('switch', { name: '启用配置开关' })).toBeVisible();
      await waitUntilGeminiEnabled(win, TOTAL_TIMEOUT_MS - 60_000);

      await win.getByRole('button', { name: '保存' }).click();
      await expect(win.getByText('已保存')).toBeVisible({ timeout: 30000 });
    } finally {
      await closeApp({ electronApp: app, root });
    }
  });
});
