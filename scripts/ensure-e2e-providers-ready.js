#!/usr/bin/env node
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { DB_FILENAME } = require('../src/shared/app-config');
const { buildProviderSettings } = require('../src/tests/e2e/provider-fixture');

const SETTINGS_KEY = 'provider_startup_settings';
const BOOTSTRAP_TEST_FILE =
  'src/pages/settings/providers/e2e/providers-claude-deepseek.e2e.js';
const BOOTSTRAP_TEST_GREP = 'can save DeepSeek provider config in settings';

function log(message) {
  process.stdout.write(`[e2e-provider-check] ${message}\n`);
}

function resolveDbCandidates() {
  const candidates = [];
  if (process.env.ZEELIN_DB_PATH) {
    candidates.push(path.resolve(process.env.ZEELIN_DB_PATH));
  }
  const home = os.homedir();
  candidates.push(path.join(home, '.cli-switch', DB_FILENAME));
  candidates.push(path.join(home, '.cli-switch-dev', DB_FILENAME));
  return [...new Set(candidates)];
}

function pickDbPath(candidates) {
  const existing = candidates
    .filter((item) => fs.existsSync(item))
    .map((item) => {
      const stat = fs.statSync(item);
      return { item, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (existing.length > 0) return existing[0].item;
  return candidates[0];
}

function safeParse(jsonText) {
  try {
    return JSON.parse(String(jsonText || '{}'));
  } catch {
    return {};
  }
}

function hasEnabledProvider(settingsValue) {
  const providers = settingsValue?.providers;
  if (!providers || typeof providers !== 'object') return false;
  return Object.values(providers).some((provider) => {
    if (!provider || typeof provider !== 'object') return false;
    const enabledProfileId = String(provider.enabledProfileId || '').trim();
    if (!enabledProfileId) return false;
    const profiles = Array.isArray(provider.profiles) ? provider.profiles : [];
    return profiles.some((profile) => String(profile?.id || '') === enabledProfileId);
  });
}

function readProviderSettingsState(dbPath) {
  if (!fs.existsSync(dbPath)) return { exists: false, enabled: false, parsed: {} };
  let db = null;
  try {
    db = new DatabaseSync(dbPath);
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_settings' LIMIT 1",
      )
      .get();
    if (!table) return { exists: true, enabled: false, parsed: {} };
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SETTINGS_KEY);
    if (!row) return { exists: true, enabled: false, parsed: {} };
    const parsed = safeParse(row.value);
    return { exists: true, enabled: hasEnabledProvider(parsed), parsed };
  } catch (error) {
    log(`读取数据库失败：${error?.message || error}`);
    return { exists: fs.existsSync(dbPath), enabled: false, parsed: {} };
  } finally {
    if (db) db.close();
  }
}

function ensureAppSettingsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function seedEnabledProvider(dbPath) {
  const token = String(process.env.TEST_DEEPSEEK || '').trim() || 'e2e-dummy-token';
  const settings = buildProviderSettings({ anthropicAuthToken: token });
  const timestamp = new Date().toISOString();

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    ensureAppSettingsTable(db);
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(SETTINGS_KEY, JSON.stringify(settings), timestamp);
  } finally {
    db.close();
  }
}

function runDeepSeekBootstrapTest() {
  log(`未检测到已启用 providers，先执行 ${BOOTSTRAP_TEST_FILE}`);
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', BOOTSTRAP_TEST_FILE, '--grep', BOOTSTRAP_TEST_GREP],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        APP_E2E_SHOW_WINDOW: process.env.APP_E2E_SHOW_WINDOW || '0',
      },
      shell: false,
    },
  );
  return Number(result.status || 0);
}

function main() {
  const dbPath = pickDbPath(resolveDbCandidates());
  log(`检查 providers 配置：${dbPath}`);

  const initial = readProviderSettingsState(dbPath);
  if (initial.enabled) {
    log('已存在启用的 provider，继续执行后续 E2E。');
    return;
  }

  const bootstrapExit = runDeepSeekBootstrapTest();
  if (bootstrapExit !== 0) {
    log(`Bootstrap 测试退出码 ${bootstrapExit}，继续执行兜底写入。`);
  }

  const afterBootstrap = readProviderSettingsState(dbPath);
  if (afterBootstrap.enabled) {
    log('Bootstrap 测试后检测到已启用 provider，继续执行后续 E2E。');
    return;
  }

  log('Bootstrap 测试未落库到当前数据库，执行兜底写入 provider 配置。');
  seedEnabledProvider(dbPath);

  const finalState = readProviderSettingsState(dbPath);
  if (!finalState.enabled) {
    log('兜底写入失败：仍未检测到已启用 providers。');
    process.exit(1);
  }
  log('已完成 provider 兜底配置，继续执行后续 E2E。');
}

main();
