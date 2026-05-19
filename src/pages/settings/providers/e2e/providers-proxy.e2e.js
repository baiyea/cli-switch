const path = require('node:path');
const net = require('node:net');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

const DEFAULT_PROXY_URL = process.env.E2E_PROXY_URL || 'http://127.0.0.1:7890';
const PROXY_INPUT_PLACEHOLDER = '代理地址，例如 http://127.0.0.1:7890';
const PROVIDER_TABS = ['Claude Code', 'Codex CLI', 'Gemini CLI'];

function parseProxyEndpoint(proxyUrl) {
  const parsed = new URL(String(proxyUrl || '').trim());
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported protocol: ${parsed.protocol}`);
  }
  const port = parsed.port
    ? Number.parseInt(parsed.port, 10)
    : parsed.protocol === 'https:'
      ? 443
      : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid port: ${parsed.port}`);
  }
  return {
    host: parsed.hostname || '127.0.0.1',
    port,
  };
}

async function probeProxyAvailability(proxyUrl, timeoutMs = 2500) {
  try {
    const endpoint = parseProxyEndpoint(proxyUrl);
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(endpoint);
      const onFinish = (err) => {
        socket.removeAllListeners();
        socket.destroy();
        if (err) reject(err);
        else resolve();
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => onFinish());
      socket.once('timeout', () => onFinish(new Error('timeout')));
      socket.once('error', (err) => onFinish(err));
    });
    return { ok: true, message: '' };
  } catch (error) {
    return {
      ok: false,
      message: `代理地址不可用 (${proxyUrl})：${error?.message || 'unknown error'}`,
    };
  }
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

async function enableProxyAndAssertSuccess(win, tabLabel, proxyUrl) {
  await win.getByRole('button', { name: tabLabel }).click();

  const proxyInput = win.getByPlaceholder(PROXY_INPUT_PLACEHOLDER);
  await expect(proxyInput).toBeVisible();
  await proxyInput.fill(proxyUrl);

  const proxySwitch = win.getByRole('switch', { name: '启用代理开关' });
  await expect(proxySwitch).toBeVisible();

  if (await proxySwitch.isChecked()) {
    await proxySwitch.click();
    await expect(proxySwitch).not.toBeChecked();
  }

  await proxySwitch.click();
  await expect(proxySwitch).toBeChecked({ timeout: 30000 });
  await expect(win.getByText('✓ 已连接')).toBeVisible({ timeout: 90000 });
}

test.describe('providers proxy connectivity', () => {
  /** @type {{ electronApp: import('playwright').ElectronApplication, window: import('playwright').Page, root: string } | null} */
  let launched = null;
  let proxyProbe = { ok: false, message: '' };

  test.beforeAll(async () => {
    proxyProbe = await probeProxyAvailability(DEFAULT_PROXY_URL);
    if (!proxyProbe.ok) return;

    const cwd = path.resolve(__dirname, '../../../../../');
    launched = await launchApp({ cwd });
    await openProviderSettings(launched.window);
  });

  test.afterAll(async () => {
    if (!launched) return;
    await closeApp({ electronApp: launched.electronApp, root: launched.root });
  });

  test('claude/codex/gemini tabs can pass proxy connectivity test', async () => {
    test.skip(!proxyProbe.ok, proxyProbe.message);

    const win = launched.window;
    for (const tabLabel of PROVIDER_TABS) {
      await enableProxyAndAssertSuccess(win, tabLabel, DEFAULT_PROXY_URL);
    }
  });
});
