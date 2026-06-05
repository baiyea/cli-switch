const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { buildSchemaSql } = require('../schema');
const { createSettingsRepo } = require('./settings.repository');

function createRepo() {
  const conn = new Database(':memory:');
  conn.exec(buildSchemaSql());
  const repo = createSettingsRepo({
    getDatabase: () => conn,
    now: () => '2026-06-05T00:00:00.000Z',
  });
  return { conn, repo };
}

test('getAppearanceSettings returns default appearance settings', () => {
  const { repo } = createRepo();

  assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'system', locale: 'zh-CN' });
});

test('setAppearanceSettings persists a valid theme mode and locale without changing provider settings', () => {
  const { conn, repo } = createRepo();

  const providerSettings = repo.setProviderStartupSettings({
    providers: {
      claude: {
        defaultProfileId: 'claude-default',
        enabledProfileId: 'claude-default',
        profiles: [{ id: 'claude-default', name: 'Claude Default', envVars: [] }],
      },
    },
  });
  const appearanceSettings = repo.setAppearanceSettings({ themeMode: 'dark', locale: 'en-US' });

  assert.deepEqual(appearanceSettings, { themeMode: 'dark', locale: 'en-US' });
  assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'dark', locale: 'en-US' });
  assert.deepEqual(repo.getProviderStartupSettings(), providerSettings);

  const rows = conn.prepare('SELECT key, value FROM app_settings ORDER BY key').all();
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.key),
    ['appearance_settings', 'provider_startup_settings'],
  );
  assert.deepEqual(JSON.parse(rows[0].value), { themeMode: 'dark', locale: 'en-US' });
});

test('appearance settings normalize invalid and missing theme modes to system', () => {
  const { repo } = createRepo();

  assert.deepEqual(repo.setAppearanceSettings({ themeMode: 'sepia' }), {
    themeMode: 'system',
    locale: 'zh-CN',
  });
  assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'system', locale: 'zh-CN' });

  assert.deepEqual(repo.setAppearanceSettings({}), { themeMode: 'system', locale: 'zh-CN' });
  assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'system', locale: 'zh-CN' });
});

test('default locale is zh-CN', () => {
  const { repo } = createRepo();

  assert.equal(repo.getAppearanceSettings().locale, 'zh-CN');
});

test('setAppearanceSettings persists locale and keeps theme mode', () => {
  const { repo } = createRepo();

  assert.deepEqual(repo.setAppearanceSettings({ themeMode: 'light', locale: 'en-US' }), {
    themeMode: 'light',
    locale: 'en-US',
  });
  assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'light', locale: 'en-US' });
});

test('invalid locale falls back to zh-CN', () => {
  const { repo } = createRepo();

  assert.deepEqual(repo.setAppearanceSettings({ themeMode: 'dark', locale: 'fr-FR' }), {
    themeMode: 'dark',
    locale: 'zh-CN',
  });
  assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'dark', locale: 'zh-CN' });
});

test('getAppearanceSettings falls back to default appearance settings for bad JSON', () => {
  const { conn, repo } = createRepo();
  conn
    .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('appearance_settings', '{bad json', '2026-06-05T00:00:00.000Z');

  assert.deepEqual(repo.getAppearanceSettings(), { themeMode: 'system', locale: 'zh-CN' });
});
