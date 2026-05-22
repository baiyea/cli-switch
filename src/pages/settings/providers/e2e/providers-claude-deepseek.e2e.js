const path = require('node:path');
const dotenv = require('dotenv');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');
const { prepareClaudeCodeFirstRunState } = require('../../../../tests/e2e/provider-fixture');

function loadDeepSeekToken() {
  dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
  return String(process.env.TEST_DEEPSEEK || '').trim();
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
  const win = await findMainWindow(launched.electronApp);
  return { ...launched, window: win };
}

async function waitForSettings(win) {
  await expect(win.locator('.settings-modal')).toBeVisible({ timeout: 90000 });
  await expect(win.getByRole('heading', { name: 'Provider Settings' })).toBeVisible({ timeout: 30000 });
}

async function configureDeepSeekInSettings(win, token) {
  await waitForSettings(win);

  await win.getByRole('button', { name: 'Claude Code' }).click();
  await win.getByTestId('provider-profile-select').selectOption('deepseek-api');
  await expect(win.getByTestId('provider-env-value-ANTHROPIC_AUTH_TOKEN')).toBeVisible();

  await win.getByTestId('provider-env-value-ANTHROPIC_AUTH_TOKEN').fill(token);
  await win.getByTestId('provider-enable-switch').click();
  await expect(win.getByText('✓ 连接成功')).toBeVisible({ timeout: 90000 });

  await win.getByRole('button', { name: '保存' }).click();
  await expect
    .poll(
      async () => {
        const modalCount = await win.locator('.settings-modal').count();
        const savedVisible = await win.getByText('已保存').isVisible().catch(() => false);
        return modalCount === 0 || savedVisible;
      },
      { timeout: 30000, intervals: [250, 500, 1000] },
    )
    .toBeTruthy();
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

  test('can save DeepSeek provider config in settings', async () => {
    const launched = await launchDeepSeekSettingsApp();
    const { window: win } = launched;
    try {
      await configureDeepSeekInSettings(win, DEEPSEEK_TOKEN);
    } finally {
      await closeApp(launched);
    }
  });

  test('settings config can launch Claude session and receive DeepSeek reply', async () => {
    const marker = `CLI_SWITCH_SETTINGS_LIVE_${Date.now()}`;
    const prompt = `Reply with exactly this single token and no other text: ${marker}`;
    const launched = await launchDeepSeekSettingsApp();
    const { window: win } = launched;

    try {
      await configureDeepSeekInSettings(win, DEEPSEEK_TOKEN);

      const sessionId = await createClaudeSession(win);
      expect(sessionId).toBeTruthy();

      await waitForClaudeCodeReady(win, sessionId);
      await sendPromptAndWaitForReply(win, sessionId, prompt, marker);
    } finally {
      await closeApp(launched);
    }
  });
});
