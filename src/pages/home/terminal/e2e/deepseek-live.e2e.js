const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const dotenv = require('dotenv');
const { DatabaseSync } = require('node:sqlite');
const providerEnvPresets = require('../../../settings/providers/shared/provider-env-presets.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadDeepSeekToken() {
  dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
  return String(process.env.TEST_DEEPSEEK || '').trim();
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
  `);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, ?)`,
  ).run('p1', 'DeepSeekLiveProject', projectDir, now, now);

  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)`,
  ).run('provider_startup_settings', JSON.stringify(providerSettings), now);

  db.close();
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
        profiles: providerEnvPresets.codex.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          envVars: [],
        })),
      },
      gemini: {
        defaultProfileId: 'api-key',
        enabledProfileId: '',
        profiles: providerEnvPresets.gemini.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          envVars: [],
        })),
      },
    },
  };
}

async function findMainWindow(app, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const win of app.windows()) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 1500 });
        if (await win.locator('.project-create-main').count()) return win;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Main window not found');
}

async function launchApp(providerSettings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-deepseek-live-'));
  const dbPath = path.join(root, 'e2e.db');
  const projectDir = path.join(root, 'project-a');
  ensureDir(projectDir);
  setupDb(dbPath, projectDir, providerSettings);

  const env = { ...process.env };
  env.APP_E2E = '1';
  env.APP_E2E_SHOW_WINDOW = process.env.APP_E2E_SHOW_WINDOW || '0';
  delete env.ANTHROPIC_API_KEY;
  delete env.ELECTRON_RUN_AS_NODE;
  env.ZEELIN_DB_PATH = dbPath;
  env.SHELL = '/bin/bash';

  const app = await electron.launch({
    args: [path.resolve(__dirname, '../../../../..')],
    env,
  });
  const win = await findMainWindow(app);
  return { app, win, root, projectDir };
}

function normalizeTerminalText(value) {
  return String(value || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
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
    const launched = await launchApp(providerSettings);
    const { app, win } = launched;

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
          async () => {
            return win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || '');
          },
          { timeout: 60000 },
        )
        .toBeTruthy();

      const activeSessionId = await win.evaluate(
        () => window.__ZEELIN_TEST__?.getActiveSessionId?.() || '',
      );
      const sessionIds = await getRenderedSessionIds(win);
      const sessionId = sessionIds.includes(activeSessionId)
        ? activeSessionId
        : sessionIds.find((id) => !beforeSessionIds.has(id)) || sessionIds[0] || '';
      expect(sessionId).toBeTruthy();

      // Verify Claude Code started
      await expect
        .poll(
          async () => {
            const buffer = await win.evaluate(
              (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
              sessionId,
            );
            const text = normalizeTerminalText(buffer);
            return (
              /@anthropic-ai.claude-code.*cli\.js|claude-code.*cli/i.test(text) &&
              !/stdin is not a terminal/i.test(text)
            );
          },
          { timeout: 90000, intervals: [1000, 2000, 3000] },
        )
        .toBeTruthy();

      // Send prompt
      await win.evaluate(
        ({ sid, input }) => {
          window.electronAPI.pty.input({ sessionId: sid, data: `${input}\r` });
        },
        { sid: sessionId, input: prompt },
      );

      // Wait for reply
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
      await app.close();
    }
  });
});
