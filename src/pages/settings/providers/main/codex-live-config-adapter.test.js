const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLiveSyncPaths } = require('./live-sync-paths');
const {
  createCodexLiveConfigAdapter,
  getActiveCodexModelProviderId,
  upsertProviderSectionToken,
} = require('./codex-live-config-adapter');

function setupCodexHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-codex-live-'));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  return { home, paths: createLiveSyncPaths({ homedir: () => home }) };
}

test('getActiveCodexModelProviderId reads the active provider from config text', () => {
  assert.equal(
    getActiveCodexModelProviderId(
      'model_provider = "thirdparty"\n\n[model_providers.thirdparty]\nbase_url = "https://api.example/v1"\n',
    ),
    'thirdparty',
  );
});

test('upsertProviderSectionToken writes provider-scoped bearer token into the active section', () => {
  const next = upsertProviderSectionToken(
    'model_provider = "thirdparty"\n\n[model_providers.thirdparty]\nbase_url = "https://api.example/v1"\n',
    'thirdparty',
    'sk-test',
  );

  assert.match(next, /\[model_providers\.thirdparty\][\s\S]*experimental_bearer_token = "sk-test"/);
});

test('third-party Codex profile preserves auth.json and writes provider-scoped token', () => {
  const { paths } = setupCodexHome();
  const authPath = paths.codexAuthPath();
  const configPath = paths.codexConfigPath();
  fs.writeFileSync(authPath, JSON.stringify({ refresh_token: 'keep-me' }, null, 2), 'utf8');
  fs.writeFileSync(
    configPath,
    'model_provider = "thirdparty"\nmodel = "gpt-5.2-codex"\n\n[model_providers.thirdparty]\nbase_url = "https://third-party.example/v1"\nwire_api = "responses"\nrequires_openai_auth = true\n',
    'utf8',
  );

  const adapter = createCodexLiveConfigAdapter();
  const result = adapter.sync({
    profile: {
      id: 'thirdparty',
      name: 'Third Party',
      meta: { codexOfficial: false },
      settingsConfig: {
        env: { OPENAI_API_KEY: 'sk-third-party' },
        config:
          'model_provider = "thirdparty"\nmodel = "gpt-5.2-codex"\n\n[model_providers.thirdparty]\nbase_url = "https://third-party.example/v1"\nwire_api = "responses"\nrequires_openai_auth = true\n',
      },
    },
    env: { OPENAI_API_KEY: 'sk-third-party' },
    paths,
    source: 'provider-test',
  });

  assert.deepEqual(result, {
    ok: true,
    configPath,
    authPath,
    authPreserved: true,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(authPath, 'utf8')), { refresh_token: 'keep-me' });
  const text = fs.readFileSync(configPath, 'utf8');
  assert.match(text, /\[model_providers\.thirdparty\][\s\S]*experimental_bearer_token = "sk-third-party"/);
});

test('official Codex profile can write auth.json and keeps config.toml intact', () => {
  const { paths } = setupCodexHome();
  const authPath = paths.codexAuthPath();
  const configPath = paths.codexConfigPath();
  fs.writeFileSync(configPath, 'model_provider = "openai"\nmodel = "gpt-5.2-codex"\n', 'utf8');

  const adapter = createCodexLiveConfigAdapter();
  const result = adapter.sync({
    profile: {
      id: 'openai-api-key',
      name: 'OpenAI API Key',
      meta: { codexOfficial: true },
      settingsConfig: {
        auth: { access_token: 'official-token' },
        config: 'model_provider = "openai"\nmodel = "gpt-5.2-codex"\n',
      },
    },
    env: { OPENAI_API_KEY: 'official-token' },
    paths,
    source: 'provider-test',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(authPath, 'utf8')), { access_token: 'official-token' });
  assert.match(fs.readFileSync(configPath, 'utf8'), /^model_provider = "openai"/m);
});
