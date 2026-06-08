const path = require('node:path');
const { spawnSync } = require('node:child_process');
const net = require('node:net');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

const CONNECTIVITY_PROXY_URL = String(process.env.E2E_PROXY_URL || '').trim();
const PERSISTED_PROXY_URL = CONNECTIVITY_PROXY_URL || 'http://127.0.0.1:7890';
const PROVIDER_TABS = ['Claude Code', 'Codex CLI', 'Gemini CLI'];
const PROXY_PROBE_TARGETS = ['https://x.com', 'https://www.google.com', 'https://github.com'];

async function readI18n(win, key) {
  const value = await win.evaluate((i18nKey) => window.__ZEELIN_TEST__?.t(i18nKey), key);
  if (!value) throw new Error(`i18n not initialized or missing key: ${key}`);
  return value;
}

async function getProxySwitch(win) {
  const proxySwitchLabel = await readI18n(win, 'settings.providers.proxyEnableSwitchAria');
  return win.getByRole('switch', { name: proxySwitchLabel });
}

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

async function probeProxyAvailabilityOnce(proxyUrl, timeoutMs = 2500) {
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
    for (const target of PROXY_PROBE_TARGETS) {
      const result = spawnSync(
        'curl',
        [
          '--silent',
          '--show-error',
          '--location',
          '--output',
          '/dev/null',
          '--max-time',
          '3',
          '--write-out',
          '%{http_code}',
          target,
        ],
        {
          env: { ...process.env, HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl },
          encoding: 'utf8',
          timeout: 4000,
        },
      );
      const status = Number.parseInt(String(result.stdout || '').trim(), 10);
      if (
        result.error ||
        result.status !== 0 ||
        !Number.isInteger(status) ||
        status < 200 ||
        status >= 500
      ) {
        return {
          ok: false,
          message: `代理地址不可用 (${proxyUrl})：${target} 探测失败${result.stderr ? ` - ${String(result.stderr).trim()}` : ''}`,
        };
      }
    }
    return { ok: true, message: '' };
  } catch (error) {
    return {
      ok: false,
      message: `代理地址不可用 (${proxyUrl})：${error?.message || 'unknown error'}`,
    };
  }
}

async function probeProxyAvailability(proxyUrl, attempts = 2) {
  if (!proxyUrl) {
    return {
      ok: false,
      message: '设置 E2E_PROXY_URL 后执行真实代理连通性测试',
    };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await probeProxyAvailabilityOnce(proxyUrl);
    if (!result.ok) {
      return {
        ok: false,
        message: `${result.message}（第 ${attempt}/${attempts} 次预探测失败）`,
      };
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return { ok: true, message: '' };
}

async function openProviderSettings(win) {
  const settingsModal = win.locator('.settings-modal');
  if (!(await settingsModal.isVisible())) {
    const settingsButton = win.getByRole('button', { name: /Settings|设置/i }).first();
    await expect(settingsButton).toBeVisible({ timeout: 60000 });
    await settingsButton.click();
  }

  await expect(settingsModal).toBeVisible({ timeout: 60000 });
  const providerTitle = await readI18n(win, 'settings.section.providers.title');
  await expect(win.getByRole('heading', { name: providerTitle })).toBeVisible();
}

async function openProviderTab(win, tabLabel) {
  await win.getByRole('button', { name: tabLabel }).click();
  const proxyUrlPlaceholder = await readI18n(win, 'settings.providers.proxyUrlPlaceholder');
  const proxyInput = win.getByPlaceholder(proxyUrlPlaceholder);
  await expect(proxyInput).toBeVisible();
  return proxyInput;
}

async function saveProviderSettings(win) {
  const saveLabel = await readI18n(win, 'settings.providers.save');
  const savedLabel = await readI18n(win, 'settings.providers.saved');
  await win.getByRole('button', { name: saveLabel }).click();
  await expect(win.getByText(new RegExp(`✓\\s*${savedLabel}`))).toBeVisible({ timeout: 30000 });
}

async function enableProxyAndAssertSuccess(win, tabLabel, proxyUrl) {
  const proxyInput = await openProviderTab(win, tabLabel);
  await proxyInput.fill(proxyUrl);

  const proxySwitch = await getProxySwitch(win);
  const connectedText = await readI18n(win, 'settings.providers.connected');
  await expect(proxySwitch).toBeVisible();

  if (await proxySwitch.isChecked()) {
    await proxySwitch.click();
    await expect(proxySwitch).not.toBeChecked();
  }

  await proxySwitch.click();
  await expect(proxySwitch).toBeChecked({ timeout: 30000 });
  await expect(win.getByText(connectedText)).toBeVisible({ timeout: 90000 });
}

test.describe('providers proxy connectivity', () => {
  /** @type {{ electronApp: import('playwright').ElectronApplication, window: import('playwright').Page, root: string } | null} */
  let launched = null;
  let proxyProbe = { ok: false, message: '' };

  test.beforeAll(async () => {
    proxyProbe = await probeProxyAvailability(CONNECTIVITY_PROXY_URL);
    const cwd = path.resolve(__dirname, '../../../../../');
    launched = await launchApp({ cwd });
    await openProviderSettings(launched.window);
  });

  test.afterAll(async () => {
    if (!launched) return;
    await closeApp({ electronApp: launched.electronApp, root: launched.root });
  });

  test('provider settings title is resolved through i18n', async () => {
    await openProviderSettings(launched.window);
  });

  test('claude/codex/gemini tabs can pass proxy connectivity test', async () => {
    test.skip(!proxyProbe.ok, proxyProbe.message);

    const win = launched.window;
    for (const tabLabel of PROVIDER_TABS) {
      await enableProxyAndAssertSuccess(win, tabLabel, CONNECTIVITY_PROXY_URL);
    }
  });
});

test.describe('providers proxy persistence', () => {
  test('codex proxy url persists after save and app restart', async () => {
    const cwd = path.resolve(__dirname, '../../../../../');
    const first = await launchApp({ cwd });
    await openProviderSettings(first.window);

    const firstProxyInput = await openProviderTab(first.window, 'Codex CLI');
    await firstProxyInput.fill(PERSISTED_PROXY_URL);
    await saveProviderSettings(first.window);
    await closeApp({
      electronApp: first.electronApp,
      root: first.root,
      keepRoot: true,
      isExternalDb: first.isExternalDb,
    });

    const second = await launchApp({ cwd, envOverrides: { ZEELIN_DB_PATH: first.dbPath } });
    try {
      await openProviderSettings(second.window);
      const secondProxyInput = await openProviderTab(second.window, 'Codex CLI');
      await expect(secondProxyInput).toHaveValue(PERSISTED_PROXY_URL);
    } finally {
      await closeApp({
        electronApp: second.electronApp,
        root: second.root,
        isExternalDb: second.isExternalDb,
      });
    }
  });

  test('codex proxy enable success is persisted without requiring a separate save click', async () => {
    const cwd = path.resolve(__dirname, '../../../../../');
    const first = await launchApp({
      cwd,
      envOverrides: { ZEELIN_E2E_PROXY_TEST_OK: '1' },
    });
    await openProviderSettings(first.window);

    const firstProxyInput = await openProviderTab(first.window, 'Codex CLI');
    await firstProxyInput.fill(PERSISTED_PROXY_URL);
    const proxySwitch = await getProxySwitch(first.window);
    if (!(await proxySwitch.isChecked())) {
      await proxySwitch.click();
    }
    const connectedText = await readI18n(first.window, 'settings.providers.connected');
    await expect(proxySwitch).toBeChecked({ timeout: 30000 });
    await expect(first.window.getByText(connectedText)).toBeVisible({ timeout: 30000 });
    await saveProviderSettings(first.window);
    await closeApp({
      electronApp: first.electronApp,
      root: first.root,
      keepRoot: true,
      isExternalDb: first.isExternalDb,
    });

    const second = await launchApp({ cwd, envOverrides: { ZEELIN_DB_PATH: first.dbPath } });
    try {
      await openProviderSettings(second.window);
      const secondProxyInput = await openProviderTab(second.window, 'Codex CLI');
      await expect(secondProxyInput).toHaveValue(PERSISTED_PROXY_URL);
      await expect(await getProxySwitch(second.window)).toBeChecked();
    } finally {
      await closeApp({
        electronApp: second.electronApp,
        root: second.root,
        isExternalDb: second.isExternalDb,
      });
    }
  });
});
