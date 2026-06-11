const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLiveSyncPaths } = require('./live-sync-paths');
const {
  createGeminiLiveConfigAdapter,
  isOauthProfile,
  serializeEnv,
  upsertSelectedType,
} = require('./gemini-live-config-adapter');

function setupGeminiHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-gemini-live-'));
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
  return { home, paths: createLiveSyncPaths({ homedir: () => home }) };
}

test('isOauthProfile detects OAuth profiles from env and metadata', () => {
  assert.equal(isOauthProfile({ settingsConfig: { env: { ZEELIN_AUTH_MODE: 'oauth' } } }), true);
  assert.equal(isOauthProfile({ meta: { authMode: 'oauth' } }), true);
  assert.equal(
    isOauthProfile({ meta: { authBinding: { authProvider: 'google_oauth' } } }),
    true,
  );
  assert.equal(isOauthProfile({ settingsConfig: { env: { GEMINI_API_KEY: 'sk' } } }), false);
});

test('serializeEnv filters internal keys and sorts output', () => {
  assert.equal(
    serializeEnv({
      ZEELIN_AUTH_MODE: 'oauth',
      GEMINI_MODEL: 'gemini-2.5-pro',
      GEMINI_API_KEY: 'sk-test',
      HTTP_PROXY: 'http://127.0.0.1:7890',
    }),
    'GEMINI_API_KEY=sk-test\nGEMINI_MODEL=gemini-2.5-pro\nHTTP_PROXY=http://127.0.0.1:7890',
  );
});

test('upsertSelectedType preserves unrelated settings fields', () => {
  const next = upsertSelectedType(
    { general: { sessionRetention: 30 }, security: { auth: { old: true } } },
    'oauth-personal',
  );

  assert.equal(next.general.sessionRetention, 30);
  assert.equal(next.security.auth.selectedType, 'oauth-personal');
  assert.equal(next.security.auth.old, true);
});

test('Gemini OAuth profile clears env and selects oauth-personal', () => {
  const { paths } = setupGeminiHome();
  const envPath = paths.geminiEnvPath();
  const settingsPath = paths.geminiSettingsPath();
  fs.writeFileSync(envPath, 'GEMINI_API_KEY=should-go-away\n', 'utf8');
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ general: { sessionRetention: 30 }, security: { auth: { selectedType: 'x' } } }),
    'utf8',
  );

  const adapter = createGeminiLiveConfigAdapter();
  const result = adapter.sync({
    profile: {
      id: 'oauth-login',
      settingsConfig: { env: { ZEELIN_AUTH_MODE: 'oauth' }, config: {} },
      meta: { authMode: 'oauth' },
    },
    env: { GEMINI_API_KEY: 'should-not-persist' },
    paths,
    source: 'provider-test',
  });

  assert.deepEqual(result, {
    ok: true,
    envPath,
    settingsPath,
    authMode: 'oauth-personal',
  });
  assert.equal(fs.readFileSync(envPath, 'utf8'), '');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(settings.general.sessionRetention, 30);
  assert.equal(settings.security.auth.selectedType, 'oauth-personal');
  assert.equal(settings.cliswitch.provider, 'gemini');
  assert.equal(settings.cliswitch.profileId, 'oauth-login');
});

test('Gemini API key profile writes env and selects gemini-api-key', () => {
  const { paths } = setupGeminiHome();
  const envPath = paths.geminiEnvPath();
  const settingsPath = paths.geminiSettingsPath();
  fs.writeFileSync(settingsPath, JSON.stringify({ general: { sessionRetention: 30 } }), 'utf8');

  const adapter = createGeminiLiveConfigAdapter();
  const result = adapter.sync({
    profile: {
      id: 'api-key',
      settingsConfig: { env: { GEMINI_API_KEY: 'key', GEMINI_MODEL: 'gemini-2.5-pro' }, config: {} },
      meta: {},
    },
    env: {
      GEMINI_API_KEY: 'key',
      GEMINI_MODEL: 'gemini-2.5-pro',
      ZEELIN_AUTH_MODE: '',
    },
    paths,
    source: 'provider-test',
  });

  assert.deepEqual(result, {
    ok: true,
    envPath,
    settingsPath,
    authMode: 'gemini-api-key',
  });
  assert.match(fs.readFileSync(envPath, 'utf8'), /^GEMINI_API_KEY=key$/m);
  assert.match(fs.readFileSync(envPath, 'utf8'), /^GEMINI_MODEL=gemini-2\.5-pro$/m);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(settings.general.sessionRetention, 30);
  assert.equal(settings.security.auth.selectedType, 'gemini-api-key');
});
