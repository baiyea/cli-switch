const { test, expect } = require("@playwright/test");
const { _electron: electron } = require("playwright");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const dotenv = require("dotenv");
const { DatabaseSync } = require("node:sqlite");
const { buildProviderSettings } = require(path.resolve(__dirname, "../../../../tests/e2e/provider-fixture"));

// 加载 DeepSeek token — 没有则测试挂掉，不要静默跳过
dotenv.config({ path: path.resolve(__dirname, "../../../../../.env") });
const DEEPSEEK_TOKEN = String(process.env.TEST_DEEPSEEK || "").trim();
if (!DEEPSEEK_TOKEN) {
  throw new Error(
    "TEST_DEEPSEEK 未配置：请在项目根目录 .env 中设置 TEST_DEEPSEEK=你的key。没有可用的 LLM，后续 e2e 无法继续。"
  );
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
     VALUES (?, ?, ?, 'claude', ?, ?)`
  ).run("p1", "DemoProject", projectDir, now, now);

  // DB 预配置 DeepSeek，直接使用 .env 中的真实 token
  const providerSettings = buildProviderSettings({ anthropicAuthToken: DEEPSEEK_TOKEN });
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)`
  ).run("provider_startup_settings", JSON.stringify(providerSettings), now);
  db.close();
}

async function launchApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cliswitch-provider-setup-"));
  const dbPath = path.join(root, "e2e.db");
  const projectDir = path.join(root, "project-a");
  ensureDir(projectDir);
  setupDb(dbPath, projectDir);

  const app = await electron.launch({
    args: [path.resolve(__dirname, "../../../../../")],
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      ZEELIN_DB_PATH: dbPath,
      SHELL: "/bin/bash"
    }
  });

  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  return { app, win };
}

test("配置 DeepSeek 作为默认 Provider", async () => {
  const { app, win } = await launchApp();

  // Provider 已在 DB 中预配置，等待 UI 加载
  await win.waitForTimeout(3000);

  // 如果显示 WelcomeView，创建项目
  const createMainBtn = win.locator(".project-create-main").first();
  if (await createMainBtn.count() > 0) {
    await createMainBtn.click({ force: true });
    await win.waitForTimeout(2000);
  }

  // 1. 打开 Settings
  const settingsBtn = win.getByRole("button", { name: /Settings/i }).first();
  await expect(settingsBtn).toBeVisible({ timeout: 30000 });
  await settingsBtn.click();
  await expect(win.locator(".settings-modal")).toBeVisible({ timeout: 10000 });

  // 2. 验证 DeepSeek 已启用
  await expect(win.getByText("已启用").first()).toBeVisible({ timeout: 5000 });

  // 3. 点击保存（即使没有修改，也验证保存功能可用）
  const saveBtn = win.getByRole("button", { name: "保存" });
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();
  await sleep(800);

  // 验证保存成功
  await expect(win.getByText("已保存").first()).toBeVisible({ timeout: 8000 });

  console.log("[e2e] DeepSeek provider verified via UI: enabled and save works");
  await app.close();
});
