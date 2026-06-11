const path = require('node:path');
const dotenv = require('dotenv');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');
const { prepareClaudeCodeFirstRunState } = require('../../../../tests/e2e/provider-fixture');

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
const DEEPSEEK_MODEL = 'deepseek-v4-pro[1m]';

function loadDeepSeekToken() {
  dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
  return String(process.env.TEST_DEEPSEEK || '').trim();
}

function maskSecret(value) {
  const text = String(value || '')
    .trim()
    .replace(/^Bearer\s+/i, '');
  if (!text) return '';
  if (text.length <= 8) return '*'.repeat(Math.max(4, text.length));
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function redactSecrets(value, token = DEEPSEEK_TOKEN) {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const rawToken = String(token || '').trim();
  if (rawToken) {
    text = text.split(rawToken).join(maskSecret(rawToken));
    text = text.split(`Bearer ${rawToken}`).join(`Bearer ${maskSecret(rawToken)}`);
  }
  return text;
}

function debugLog(label, details = {}) {
  console.info(`[deepseek-e2e] ${label}: ${redactSecrets(details)}`);
}

async function attachJson(testInfo, name, value) {
  const body = redactSecrets(value);
  debugLog(name, value);
  if (!testInfo?.attach) return;
  await testInfo.attach(`${name}.json`, {
    body,
    contentType: 'application/json',
  });
}

async function readI18n(win, key) {
  const value = await win.evaluate((i18nKey) => window.__ZEELIN_TEST__?.t(i18nKey), key);
  if (!value) throw new Error(`i18n not initialized for ${key}`);
  return value;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildDeepSeekHeaders(token) {
  const rawToken = String(token || '')
    .trim()
    .replace(/^Bearer\s+/i, '');
  return {
    'anthropic-version': '2023-06-01',
    'x-api-key': rawToken,
    Authorization: `Bearer ${rawToken}`,
  };
}

async function probeDeepSeekFromTestRunner(token) {
  const startedAt = Date.now();
  const headers = buildDeepSeekHeaders(token);
  const result = {
    baseUrl: DEEPSEEK_BASE_URL,
    hasToken: !!String(token || '').trim(),
    token: maskSecret(token),
    model: DEEPSEEK_MODEL,
    models: null,
    messages: null,
    durationMs: 0,
  };

  try {
    const modelsResp = await fetchWithTimeout(`${DEEPSEEK_BASE_URL}/v1/models`, {
      method: 'GET',
      headers,
    });
    const modelsBody = await modelsResp.text();
    result.models = {
      ok: modelsResp.ok,
      status: modelsResp.status,
      body: String(modelsBody || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    };
    if (modelsResp.ok) return { ...result, durationMs: Date.now() - startedAt };
  } catch (error) {
    result.models = { ok: false, error: error?.message || String(error) };
  }

  try {
    const messagesResp = await fetchWithTimeout(`${DEEPSEEK_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    const messagesBody = await messagesResp.text();
    result.messages = {
      ok: messagesResp.ok,
      status: messagesResp.status,
      body: String(messagesBody || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    };
  } catch (error) {
    result.messages = { ok: false, error: error?.message || String(error) };
  }

  return { ...result, durationMs: Date.now() - startedAt };
}

function attachAppProcessLogging(launched, label) {
  const child = launched?.electronApp?.process?.();
  if (!child) {
    debugLog(`${label}:electron-process`, { available: false });
    return;
  }
  debugLog(`${label}:electron-process`, { pid: child.pid, available: true });
  for (const streamName of ['stdout', 'stderr']) {
    const stream = child[streamName];
    if (!stream?.on) continue;
    stream.on('data', (chunk) => {
      const lines = String(chunk || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (
          /provider-test|settings|DeepSeek|Claude probe|connection|连接|Unhandled/i.test(line)
        ) {
          console.info(`[deepseek-e2e:${label}:${streamName}] ${redactSecrets(line)}`);
        }
      }
    });
  }
}

async function findMainWindow(app, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const win of app.windows()) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 1500 });
        if (await win.locator('.settings-modal').count()) return win;
        if (await win.locator('.project-create-main').count()) return win;
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Main window not found');
}

async function launchDeepSeekSettingsApp() {
  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-provider-claude-deepseek-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DeepSeekProject',
    providerSettings: null,
    prepareFs: prepareClaudeCodeFirstRunState,
    unsetEnvKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  });
  attachAppProcessLogging(launched, 'settings-app');
  const win = await findMainWindow(launched.electronApp);
  return { ...launched, window: win };
}

async function waitForSettings(win) {
  await expect(win.locator('.settings-modal')).toBeVisible({ timeout: 90000 });
  const providerTitle = await readI18n(win, 'settings.section.providers.title');
  await expect(win.getByRole('heading', { name: providerTitle })).toBeVisible({ timeout: 30000 });
}

async function collectProviderDebugState(win) {
  return win.evaluate(() => {
    const getByTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
    const envInputs = Array.from(document.querySelectorAll('[data-testid^="provider-env-value-"]'));
    const statusTexts = Array.from(document.querySelectorAll('.settings-modal span'))
      .map((node) => String(node.textContent || '').trim())
      .filter((text) => /连接|Connection|Testing|测试|启用|Enable/i.test(text));
    const authInput = getByTestId('provider-env-value-ANTHROPIC_AUTH_TOKEN');
    const enableSwitch = getByTestId('provider-enable-switch');
    const modal = document.querySelector('.settings-modal');
    return {
      profileSelectValue: getByTestId('provider-profile-select')?.value || '',
      authTokenInputLength: authInput?.value?.length || 0,
      envInputTestIds: envInputs.map((node) => node.getAttribute('data-testid')),
      enableSwitch: {
        checked: !!enableSwitch?.checked,
        disabled: !!enableSwitch?.disabled,
        ariaLabel: enableSwitch?.getAttribute('aria-label') || '',
      },
      statusTexts,
      modalTextTail: String(modal?.innerText || '').slice(-2000),
    };
  });
}

async function captureProviderDiagnostics(win, testInfo, label) {
  await attachJson(testInfo, `${label}-provider-state`, await collectProviderDebugState(win));
  if (!testInfo?.attach) return;
  const screenshot = await win.screenshot({ fullPage: true });
  await testInfo.attach(`${label}-screenshot.png`, {
    body: screenshot,
    contentType: 'image/png',
  });
}

async function waitForProviderConnectionResult(win, testInfo, runnerProbe) {
  const successText = await readI18n(win, 'settings.providers.connectionSuccess');
  const failedText = await readI18n(win, 'settings.providers.connectionFailed');
  const testingText = await readI18n(win, 'settings.providers.testing');

  const result = await expect
    .poll(
      async () => {
        const state = await collectProviderDebugState(win);
        const hasSuccess = state.statusTexts.some((text) => text.includes(successText));
        const hasFailed = state.statusTexts.some((text) => text.includes(failedText));
        const isTesting = state.statusTexts.some((text) => text.includes(testingText));
        if (hasSuccess) return { status: 'success', state };
        if (hasFailed) return { status: 'failed', state };
        return { status: isTesting ? 'testing' : 'pending', state };
      },
      { timeout: 90000, intervals: [500, 1000, 2000, 5000] },
    )
    .not.toEqual(expect.objectContaining({ status: expect.stringMatching(/pending|testing/) }));

  const state = await collectProviderDebugState(win);
  if (state.statusTexts.some((text) => text.includes(failedText))) {
    await captureProviderDiagnostics(win, testInfo, 'deepseek-connect-failed');
    throw new Error(
      `DeepSeek provider connection failed: ${redactSecrets({
        runnerProbe,
        providerState: state,
      })}`,
    );
  }
  return result;
}

async function configureDeepSeekInSettings(win, token, testInfo) {
  await waitForSettings(win);
  await attachJson(testInfo, 'deepseek-test-env', {
    hasTestDeepSeekToken: !!token,
    token: maskSecret(token),
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_MODEL,
  });
  const runnerProbe = await probeDeepSeekFromTestRunner(token);
  await attachJson(testInfo, 'deepseek-runner-probe', runnerProbe);
  const probeUnavailable =
    runnerProbe?.models?.status === 404 || runnerProbe?.messages?.status === 402;
  if (probeUnavailable) {
    test.skip(
      true,
      `DeepSeek account or API is unavailable for this test run (${runnerProbe?.models?.status || 'n/a'} / ${runnerProbe?.messages?.status || 'n/a'})`,
    );
  }

  await win.getByRole('button', { name: 'Claude Code' }).click();
  await win.getByTestId('provider-profile-select').selectOption('deepseek-api');
  await expect(win.getByTestId('provider-env-value-ANTHROPIC_AUTH_TOKEN')).toBeVisible();
  await attachJson(testInfo, 'deepseek-before-token-fill', await collectProviderDebugState(win));

  await win.getByTestId('provider-env-value-ANTHROPIC_AUTH_TOKEN').fill(token);
  await attachJson(testInfo, 'deepseek-after-token-fill', await collectProviderDebugState(win));
  await win.getByTestId('provider-enable-switch').click();
  await waitForProviderConnectionResult(win, testInfo, runnerProbe);

  const saveText = await readI18n(win, 'settings.providers.save');
  const savedText = await readI18n(win, 'settings.providers.saved');
  await win.getByRole('button', { name: saveText }).click();
  await expect
    .poll(
      async () => {
        const modalCount = await win.locator('.settings-modal').count();
        const savedVisible = await win.getByText(savedText).isVisible().catch(() => false);
        return modalCount === 0 || savedVisible;
      },
      { timeout: 30000, intervals: [250, 500, 1000] },
    )
    .toBeTruthy();
  await attachJson(testInfo, 'deepseek-after-save', await collectProviderDebugState(win));
}

function normalizeTerminalText(value) {
  return String(value || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\[[0-9;:?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\r/g, '\n');
}

async function getRenderedSessionIds(win) {
  return win
    .locator('[data-session-id]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-session-id')).filter(Boolean));
}

async function createClaudeSession(win) {
  const beforeSessionIds = new Set(await getRenderedSessionIds(win));
  await win.locator('.project-create-main').first().click({ force: true });

  await expect
    .poll(
      async () => {
        const ids = await getRenderedSessionIds(win);
        return ids.find((id) => !beforeSessionIds.has(id)) || ids[0] || '';
      },
      { timeout: 90000, intervals: [500, 1000, 2000] },
    )
    .toBeTruthy();

  const activeSessionId = await expect
    .poll(
      async () => {
        return win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || '');
      },
      { timeout: 90000, intervals: [500, 1000, 2000] },
    )
    .toBeTruthy();

  const sessionIds = await getRenderedSessionIds(win);
  return sessionIds.includes(activeSessionId)
    ? activeSessionId
    : sessionIds.find((id) => !beforeSessionIds.has(id)) || sessionIds[0] || '';
}

async function waitForClaudeCodeReady(win, sessionId) {
  await expect
    .poll(
      async () => {
        const buffer = await win.evaluate(
          (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
          sessionId,
        );
        const text = normalizeTerminalText(buffer);
        if (/No startup command available|stdin is not a terminal|command not found/i.test(text)) {
          throw new Error(`Claude Code did not start: ${text.slice(-2000)}`);
        }
        return (
          /@anthropic-ai\.claude-code.*cli\.js|claude-code.*cli/i.test(text) ||
          /Claude\s*Code\s*v[\s\S]*bypass\s*permissions\s*on/i.test(text)
        );
      },
      { timeout: 120000, intervals: [1000, 2000, 3000] },
    )
    .toBeTruthy();
}

async function sendPromptAndWaitForReply(win, sessionId, prompt, marker) {
  const beforeText = normalizeTerminalText(
    await win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '', sessionId),
  );
  const beforeMarkerCount = beforeText.split(marker).length - 1;

  await win.evaluate(
    ({ sid, input }) => {
      window.electronAPI.pty.input({ sessionId: sid, data: `${input}\r` });
    },
    { sid: sessionId, input: prompt },
  );

  await expect
    .poll(
      async () => {
        const buffer = await win.evaluate(
          (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
          sessionId,
        );
        const text = normalizeTerminalText(buffer);
        if (/invalid api key|401|Unauthorized|No startup command available|stdin is not a terminal/i.test(text)) {
          throw new Error(`DeepSeek terminal failed: ${text.slice(-2500)}`);
        }
        const markerCount = text.split(marker).length - 1;
        return markerCount > beforeMarkerCount + 1;
      },
      { timeout: 6 * 60 * 1000, intervals: [3000, 5000, 10000] },
    )
    .toBeTruthy();
}

const DEEPSEEK_TOKEN = loadDeepSeekToken();
const describe = DEEPSEEK_TOKEN ? test.describe : test.describe.skip;

describe('Claude DeepSeek provider flow', () => {
  test.setTimeout(9 * 60 * 1000);

  test('can save DeepSeek provider config in settings', async ({ browserName: _browserName }, testInfo) => {
    const launched = await launchDeepSeekSettingsApp();
    const { window: win } = launched;
    try {
      await configureDeepSeekInSettings(win, DEEPSEEK_TOKEN, testInfo);
    } finally {
      await closeApp(launched);
    }
  });

  test('settings config can launch Claude session and receive DeepSeek reply', async (
    { browserName: _browserName },
    testInfo,
  ) => {
    const marker = `CLI_SWITCH_SETTINGS_LIVE_${Date.now()}`;
    const prompt = `Reply with exactly this single token and no other text: ${marker}`;
    const launched = await launchDeepSeekSettingsApp();
    const { window: win } = launched;

    try {
      await configureDeepSeekInSettings(win, DEEPSEEK_TOKEN, testInfo);

      const sessionId = await createClaudeSession(win);
      expect(sessionId).toBeTruthy();

      await waitForClaudeCodeReady(win, sessionId);
      await sendPromptAndWaitForReply(win, sessionId, prompt, marker);
    } finally {
      await closeApp(launched);
    }
  });
});
