const path = require('node:path');
const dotenv = require('dotenv');
const providerEnvPresets = require('../../../settings/providers/shared/provider-env-presets.json');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');
const { prepareClaudeCodeFirstRunState } = require('../../../../tests/e2e/provider-fixture');

function loadDeepSeekToken() {
  dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
  return String(process.env.TEST_DEEPSEEK || '').trim();
}

function buildDeepSeekProviderSettings(token) {
  const deepSeekPreset = providerEnvPresets.claude.profiles.find((p) => p.id === 'deepseek-api');
  if (!deepSeekPreset) throw new Error('provider-env-presets.json 缺少 claude.deepseek-api 预设');

  const deepSeekProfile = {
    id: deepSeekPreset.id,
    name: deepSeekPreset.name,
    envVars: deepSeekPreset.envVars.map((pair) => ({
      key: pair.key,
      value:
        pair.key === 'ANTHROPIC_AUTH_TOKEN' ? token : pair.value === null ? '' : String(pair.value),
    })),
  };

  return {
    providers: {
      claude: {
        defaultProfileId: 'deepseek-api',
        enabledProfileId: 'deepseek-api',
        profiles: [deepSeekProfile],
      },
      codex: {
        defaultProfileId: 'openai-api-key',
        enabledProfileId: '',
        profiles: providerEnvPresets.codex.profiles.map((p) => ({ id: p.id, name: p.name, envVars: [] })),
      },
      gemini: {
        defaultProfileId: 'api-key',
        enabledProfileId: '',
        profiles: providerEnvPresets.gemini.profiles.map((p) => ({ id: p.id, name: p.name, envVars: [] })),
      },
    },
  };
}

async function launchDeepSeekApp(providerSettings) {
  return launchApp({
    cwd: path.resolve(__dirname, '../../../../..'),
    rootPrefix: 'cliswitch-deepseek-live-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DeepSeekLiveProject',
    providerSettings,
    prepareFs: prepareClaudeCodeFirstRunState,
    unsetEnvKeys: ['ANTHROPIC_API_KEY'],
  });
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

const DEEPSEEK_TOKEN = loadDeepSeekToken();
const describe = DEEPSEEK_TOKEN ? test.describe : test.describe.skip;

describe('Claude Code starts with DeepSeek preset and replies in terminal', () => {
  test.setTimeout(8 * 60 * 1000);

  test('DeepSeek preset live reply', async () => {
    const marker = `CLI_SWITCH_E2E_OK_${Date.now()}`;
    const prompt = `Reply with exactly this single token and no other text: ${marker}`;
    const providerSettings = buildDeepSeekProviderSettings(DEEPSEEK_TOKEN);
    const launched = await launchDeepSeekApp(providerSettings);
    const { electronApp, window: win, root } = launched;

    try {
      const beforeSessionIds = new Set(await getRenderedSessionIds(win));
      await win.locator('.project-create-main').first().click({ force: true });
      await expect(win.locator('.session-item-name').first()).toHaveText(/claude-\d+/, {
        timeout: 60000,
      });

      await expect
        .poll(
          async () => {
            const ids = await getRenderedSessionIds(win);
            return ids.find((id) => !beforeSessionIds.has(id)) || ids[0] || '';
          },
          { timeout: 60000 },
        )
        .toBeTruthy();

      await expect
        .poll(
          async () => win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || ''),
          { timeout: 60000 },
        )
        .toBeTruthy();

      const activeSessionId = await win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || '');
      const sessionIds = await getRenderedSessionIds(win);
      const sessionId = sessionIds.includes(activeSessionId)
        ? activeSessionId
        : sessionIds.find((id) => !beforeSessionIds.has(id)) || sessionIds[0] || '';
      expect(sessionId).toBeTruthy();

      await expect
        .poll(
          async () => {
            const buffer = await win.evaluate(
              (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
              sessionId,
            );
            const text = normalizeTerminalText(buffer);
            return (
              (/@anthropic-ai.claude-code.*cli\.js|claude-code.*cli/i.test(text) ||
                /Claude\s*Code\s*v[\s\S]*bypass\s*permissions\s*on/i.test(text)) &&
              !/stdin is not a terminal/i.test(text)
            );
          },
          { timeout: 90000, intervals: [1000, 2000, 3000] },
        )
        .toBeTruthy();

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
            if (/stdin is not a terminal|invalid api key|401|Unauthorized/i.test(text)) {
              throw new Error(`DeepSeek terminal failed: ${text.slice(-2000)}`);
            }
            return text.includes(marker);
          },
          { timeout: 6 * 60 * 1000, intervals: [3000, 5000, 10000] },
        )
        .toBeTruthy();
    } finally {
      await closeApp({ electronApp, root });
    }
  });
});
