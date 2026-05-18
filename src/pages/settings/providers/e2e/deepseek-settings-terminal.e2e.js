const { test, expect } = require("@playwright/test");
const { _electron: electron } = require("playwright");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const dotenv = require("dotenv");
const { DatabaseSync } = require("node:sqlite");
const { buildSchemaSql } = require(path.resolve(__dirname, "../../../../kernel/db/models"));
const { buildProviderSettings } = require(path.resolve(__dirname, "../../../../tests/e2e/provider-fixture"));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadDeepSeekToken() {
  dotenv.config({ path: path.resolve(__dirname, "../../../../../.env") });
  return String(process.env.TEST_DEEPSEEK || "").trim();
}

function setupDb(dbPath, projectDir) {
  const db = new DatabaseSync(dbPath);
  db.exec(buildSchemaSql());

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, ?)`
  ).run("p1", "DeepSeekSettingsLiveProject", projectDir, now, now);

  const providerSettings = buildProviderSettings();
  db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`)
    .run("provider_startup_settings", JSON.stringify(providerSettings), now);

  db.close();
}

async function findMainWindow(app, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const win of app.windows()) {
      try {
        await win.waitForLoadState("domcontentloaded", { timeout: 1500 });
        if (await win.locator(".settings-modal").count()) return win;
        if (await win.locator(".project-create-main").count()) return win;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Main window not found");
}

async function launchApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cliswitch-deepseek-settings-live-"));
  const dbPath = path.join(root, "e2e.db");
  const projectDir = path.join(root, "project-a");
  ensureDir(projectDir);
  setupDb(dbPath, projectDir);

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  env.HOME = root;
  env.USERPROFILE = root;
  env.ZEELIN_DB_PATH = dbPath;
  env.SHELL = "/bin/bash";

  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../../../..")],
    env
  });
  const win = await findMainWindow(app);
  return { app, win, root, projectDir };
}

function normalizeTerminalText(value) {
  return String(value || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\r/g, "\n");
}

async function waitForSettings(win) {
  await expect(win.locator(".settings-modal")).toBeVisible({ timeout: 90000 });
  await expect(win.getByRole("heading", { name: "Provider Settings" })).toBeVisible({ timeout: 30000 });
}

async function configureDeepSeekInSettings(win, token) {
  await waitForSettings(win);

  await win.getByRole("button", { name: "Claude Code" }).click();
  await win.getByTestId("provider-profile-select").selectOption("deepseek-api");
  await expect(win.getByTestId("provider-env-value-ANTHROPIC_AUTH_TOKEN")).toBeVisible();

  await win.getByTestId("provider-env-value-ANTHROPIC_AUTH_TOKEN").fill(token);

  await win.getByTestId("provider-enable-switch").click();
  await expect(win.getByText("✓ 连接成功")).toBeVisible({ timeout: 90000 });

  await win.getByRole("button", { name: "保存" }).click();
  await expect(win.locator(".settings-modal")).toHaveCount(0, { timeout: 30000 });
}

async function getRenderedSessionIds(win) {
  return win.locator("[data-session-id]").evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-session-id")).filter(Boolean)
  );
}

async function createClaudeSession(win) {
  const beforeSessionIds = new Set(await getRenderedSessionIds(win));
  await win.locator(".project-create-main").first().click({ force: true });

  await expect.poll(async () => {
    const ids = await getRenderedSessionIds(win);
    return ids.find((id) => !beforeSessionIds.has(id)) || ids[0] || "";
  }, { timeout: 90000, intervals: [500, 1000, 2000] }).toBeTruthy();

  await expect.poll(async () => {
    return win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || "");
  }, { timeout: 90000, intervals: [500, 1000, 2000] }).toBeTruthy();

  const activeSessionId = await win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || "");
  const sessionIds = await getRenderedSessionIds(win);
  return sessionIds.includes(activeSessionId)
    ? activeSessionId
    : (sessionIds.find((id) => !beforeSessionIds.has(id)) || sessionIds[0] || "");
}

async function waitForClaudeCodeReady(win, sessionId) {
  await expect.poll(async () => {
    const buffer = await win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || "", sessionId);
    const text = normalizeTerminalText(buffer);
    if (/No startup command available|stdin is not a terminal|command not found/i.test(text)) {
      throw new Error(`Claude Code did not start: ${text.slice(-2000)}`);
    }
    return /@anthropic-ai.claude-code.*cli\.js|claude-code.*cli|claude/i.test(text);
  }, { timeout: 120000, intervals: [1000, 2000, 3000] }).toBeTruthy();
}

async function sendPromptAndWaitForReply(win, sessionId, prompt, marker) {
  const beforeText = normalizeTerminalText(
    await win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || "", sessionId)
  );
  const beforeMarkerCount = beforeText.split(marker).length - 1;

  await win.evaluate(({ sid, input }) => {
    window.electronAPI.pty.input({ sessionId: sid, data: `${input}\r` });
  }, { sid: sessionId, input: prompt });

  await expect.poll(async () => {
    const buffer = await win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || "", sessionId);
    const text = normalizeTerminalText(buffer);
    if (/invalid api key|401|Unauthorized|No startup command available|stdin is not a terminal/i.test(text)) {
      throw new Error(`DeepSeek terminal failed: ${text.slice(-2500)}`);
    }
    const markerCount = text.split(marker).length - 1;
    return markerCount > beforeMarkerCount + 1;
  }, { timeout: 6 * 60 * 1000, intervals: [3000, 5000, 10000] }).toBeTruthy();
}

const DEEPSEEK_TOKEN = loadDeepSeekToken();
const describe = DEEPSEEK_TOKEN ? test.describe : test.describe.skip;

describe("Settings 配置 DeepSeek key 后 Claude Code 终端能收到完整回复", () => {
  test.setTimeout(9 * 60 * 1000);

  test("DeepSeek settings config → terminal reply", async () => {
    const marker = `CLI_SWITCH_SETTINGS_LIVE_${Date.now()}`;
    const prompt = `Reply with exactly this single token and no other text: ${marker}`;
    const launched = await launchApp();
    const { app, win } = launched;

    try {
      await configureDeepSeekInSettings(win, DEEPSEEK_TOKEN);

      const sessionId = await createClaudeSession(win);
      expect(sessionId).toBeTruthy();

      await waitForClaudeCodeReady(win, sessionId);
      await sendPromptAndWaitForReply(win, sessionId, prompt, marker);
    } finally {
      await app.close();
    }
  });
});
