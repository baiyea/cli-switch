const { test, expect } = require("@playwright/test");
const { _electron: electron } = require("playwright");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const dotenv = require("dotenv");
const { DatabaseSync } = require("node:sqlite");
const providerEnvPresets = require("../../src/renderer/assets/provider-env-presets.json");

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
  `);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, ?)`
  ).run("p1", "DeepSeekLiveProject", projectDir, now, now);

  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)`
  ).run("provider_startup_settings", JSON.stringify(providerSettings), now);

  db.close();
}

function loadDeepSeekProviderSettings() {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
  const token = String(process.env.TEST_DEEPSEEK || "").trim();
  if (!token) {
    throw new Error(".env 缺少 TEST_DEEPSEEK，无法运行 DeepSeek live e2e");
  }

  const deepSeekPreset = providerEnvPresets.claude.profiles.find((profile) => profile.id === "deepseek-api");
  if (!deepSeekPreset) {
    throw new Error("provider-env-presets.json 缺少 claude.deepseek-api 预设");
  }

  const deepSeekProfile = {
    id: deepSeekPreset.id,
    name: deepSeekPreset.name,
    envVars: deepSeekPreset.envVars.map((pair) => ({
      key: pair.key,
      value: pair.key === "ANTHROPIC_AUTH_TOKEN" ? token : (pair.value === null ? "" : String(pair.value))
    }))
  };

  return {
    providers: {
      claude: {
        defaultProfileId: "deepseek-api",
        enabledProfileId: "deepseek-api",
        profiles: [deepSeekProfile]
      },
      codex: {
        defaultProfileId: "openai-api-key",
        enabledProfileId: "",
        profiles: providerEnvPresets.codex.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          envVars: []
        }))
      },
      gemini: {
        defaultProfileId: "api-key",
        enabledProfileId: "",
        profiles: providerEnvPresets.gemini.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          envVars: []
        }))
      }
    }
  };
}

async function findMainWindow(app, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const win of app.windows()) {
      try {
        await win.waitForLoadState("domcontentloaded", { timeout: 1500 });
        if (await win.locator(".project-create-main").count()) return win;
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Main window not found");
}

async function launchApp(providerSettings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cliswitch-claude-deepseek-"));
  const dbPath = path.join(root, "e2e.db");
  const projectDir = path.join(root, "project-a");
  ensureDir(projectDir);
  setupDb(dbPath, projectDir, providerSettings);

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  env.ZEELIN_DB_PATH = dbPath;
  env.SHELL = "/bin/bash";

  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../")],
    env
  });
  const win = await findMainWindow(app);
  return { app, win, root, projectDir };
}

function getUserClaudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function getUserClaudeConfigPath() {
  return path.join(os.homedir(), ".claude.json");
}

function seedWrongUserClaudeEnv() {
  const settingsPath = getUserClaudeSettingsPath();
  ensureDir(path.dirname(settingsPath));
  const original = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf8") : null;
  const configPath = getUserClaudeConfigPath();
  const originalConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : null;
  let settings = {};
  try {
    settings = original ? JSON.parse(original) : {};
  } catch {
    settings = {};
  }
  fs.writeFileSync(settingsPath, JSON.stringify({
    ...settings,
    env: {
      ANTHROPIC_AUTH_TOKEN: "sk-minimax-wrong-token",
      ANTHROPIC_BASE_URL: "https://api.minimaxi.com/anthropic",
      ANTHROPIC_MODEL: "MiniMax-M2.5"
    },
    skipDangerousModePermissionPrompt: true
  }, null, 2), "utf8");
  return { settingsPath, original, configPath, originalConfig };
}

function restoreUserClaudeSettings(snapshot) {
  if (!snapshot) return;
  if (snapshot.original === null) {
    try {
      fs.rmSync(snapshot.settingsPath, { force: true });
    } catch {}
  } else {
    fs.writeFileSync(snapshot.settingsPath, snapshot.original, "utf8");
  }
  if (snapshot.originalConfig === null) {
    try {
      fs.rmSync(snapshot.configPath, { force: true });
    } catch {}
  } else {
    fs.writeFileSync(snapshot.configPath, snapshot.originalConfig, "utf8");
  }
}

function normalizeTerminalText(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\r/g, "\n");
}

async function getRenderedSessionIds(win) {
  return win.locator("[data-session-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-session-id")).filter(Boolean)
  );
}

async function getActiveSidebarSessionId(win) {
  return win.locator(".session-item.active").first().getAttribute("data-testid").then((value) =>
    String(value || "").replace(/^session-item-/, "")
  ).catch(() => "");
}

test("Claude Code starts with DeepSeek preset and replies in terminal", async () => {
  test.setTimeout(8 * 60 * 1000);
  const providerSettings = loadDeepSeekProviderSettings();
  const marker = `CLI_SWITCH_E2E_OK_${Date.now()}`;
  const prompt = `Reply with exactly this single token and no other text: ${marker}`;
  let app;
  let userSettingsSnapshot;

  try {
    userSettingsSnapshot = seedWrongUserClaudeEnv();
    const launched = await launchApp(providerSettings);
    app = launched.app;
    const { win } = launched;

    const beforeSessionIds = new Set(await getRenderedSessionIds(win));
    await win.locator(".project-create-main").first().click({ force: true });
    await expect(win.locator(".session-item-name").first()).toHaveText(/claude-\d+/, { timeout: 60000 });
    await expect.poll(async () => {
      const ids = await getRenderedSessionIds(win);
      return ids.find((id) => !beforeSessionIds.has(id)) || ids[0] || "";
    }, { timeout: 60000 }).toBeTruthy();
    await expect.poll(async () => {
      return win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || "");
    }, { timeout: 60000 }).toBeTruthy();
    const activeSessionId = await win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || "");
    const sessionIds = await getRenderedSessionIds(win);
    const sessionId = sessionIds.includes(activeSessionId)
      ? activeSessionId
      : (sessionIds.find((id) => !beforeSessionIds.has(id)) || sessionIds[0] || "");
    expect(sessionId).toBeTruthy();

    const userSettingsPath = getUserClaudeSettingsPath();
    await expect.poll(() => JSON.parse(fs.readFileSync(userSettingsPath, "utf8")).env.ANTHROPIC_BASE_URL, {
      timeout: 30000
    }).toBe("https://api.deepseek.com/anthropic");
    const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, "utf8"));
    expect(userSettings.env.ANTHROPIC_MODEL).toBe("deepseek-v4-pro[1m]");
    expect(userSettings.env.ANTHROPIC_AUTH_TOKEN).not.toBe("sk-minimax-wrong-token");
    expect(userSettings.env.ANTHROPIC_REASONING_MODEL).toBeUndefined();

    await expect.poll(async () => {
      const buffer = await win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || "", sessionId);
      const text = normalizeTerminalText(buffer);
      return /@anthropic-ai\\claude-code\\cli\.js|@anthropic-ai\/claude-code\/cli\.js/.test(text)
        && !/stdin is not a terminal/i.test(text);
    }, { timeout: 90000, intervals: [1000, 2000, 3000] }).toBeTruthy();

    await win.evaluate(({ sid, input }) => {
      window.electronAPI.pty.input({ sessionId: sid, data: `${input}\r` });
    }, { sid: sessionId, input: prompt });

    await expect.poll(async () => {
      const buffer = await win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || "", sessionId);
      const text = normalizeTerminalText(buffer);
      if (/stdin is not a terminal|invalid api key|401|Unauthorized/i.test(text)) {
        throw new Error(`Claude DeepSeek terminal failed: ${text.slice(-2000)}`);
      }
      return text.includes(marker);
    }, { timeout: 6 * 60 * 1000, intervals: [3000, 5000, 10000] }).toBeTruthy();
  } finally {
    if (app) await app.close();
    restoreUserClaudeSettings(userSettingsSnapshot);
  }
});
