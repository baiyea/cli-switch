const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProviderLiveSyncService } = require('./provider-live-sync-service');

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-live-sync-'));
}

function createLogger(calls) {
  return {
    logInfo: (...args) => calls.info.push(args),
    logWarn: (...args) => calls.warn.push(args),
  };
}

test('unknown provider is skipped with reason unsupported-provider', async () => {
  const home = tempHome();
  const calls = { info: [], warn: [] };
  const service = createProviderLiveSyncService({
    homedir: () => home,
    ...createLogger(calls),
  });

  const result = await service.syncProviderLiveConfig({
    provider: 'unknown',
    profile: { id: 'profile-1' },
    env: { A: '1' },
    source: 'manual-test',
  });

  assert.deepEqual(result, { ok: true, skipped: true, reason: 'unsupported-provider' });
  assert.equal(calls.info.length, 0);
  assert.equal(calls.warn.length, 0);
});

test('missing config dir for claude skips live sync, does not create ~/.claude, and logs the skip message', async () => {
  const home = tempHome();
  const calls = { info: [], warn: [] };
  const service = createProviderLiveSyncService({
    homedir: () => home,
    ...createLogger(calls),
    claudeAdapter: {
      sync: () => {
        throw new Error('should not be called');
      },
    },
  });

  const result = await service.syncProviderLiveConfig({
    provider: 'claude',
    profile: { id: 'profile-1' },
    env: { CLAUDE_CODE_DISABLE_AUTOUPDATER: '1' },
    source: 'manual-test',
  });

  assert.deepEqual(result, {
    ok: true,
    skipped: true,
    reason: 'live-config-not-initialized',
  });
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  assert.equal(calls.info.length, 1);
  assert.equal(
    calls.info[0][1],
    'Skipped provider live sync because CLI config is not initialized',
  );
  assert.equal(calls.warn.length, 0);
});

test('when a claude adapter is provided and ~/.claude exists, the adapter is called with profile, env, paths, and source', async () => {
  const home = tempHome();
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const calls = { info: [], warn: [] };
  let payload = null;
  const service = createProviderLiveSyncService({
    homedir: () => home,
    ...createLogger(calls),
    claudeAdapter: {
      sync: (input) => {
        payload = input;
        return { ok: true, synced: true };
      },
    },
  });

  const result = await service.syncProviderLiveConfig({
    provider: 'claude',
    profile: { id: 'profile-1', name: 'Claude Profile' },
    env: { ANTHROPIC_BASE_URL: 'https://api.example.test/anthropic' },
    source: 'provider-test',
  });

  assert.deepEqual(result, { ok: true, synced: true });
  assert.ok(payload);
  assert.deepEqual(payload.profile, { id: 'profile-1', name: 'Claude Profile' });
  assert.deepEqual(payload.env, {
    ANTHROPIC_BASE_URL: 'https://api.example.test/anthropic',
  });
  assert.equal(payload.source, 'provider-test');
  assert.equal(typeof payload.paths.claudeDir, 'function');
  assert.equal(payload.paths.claudeDir(), path.join(home, '.claude'));
  assert.equal(payload.paths.claudeSettingsPath(), path.join(home, '.claude', 'settings.json'));
  assert.equal(payload.paths.codexDir(), path.join(home, '.codex'));
  assert.equal(payload.paths.codexAuthPath(), path.join(home, '.codex', 'auth.json'));
  assert.equal(payload.paths.codexConfigPath(), path.join(home, '.codex', 'config.toml'));
  assert.equal(payload.paths.geminiDir(), path.join(home, '.gemini'));
  assert.equal(payload.paths.geminiEnvPath(), path.join(home, '.gemini', '.env'));
  assert.equal(payload.paths.geminiSettingsPath(), path.join(home, '.gemini', 'settings.json'));
  assert.equal(calls.warn.length, 0);
});

test('if the adapter throws, service returns { ok: false } and logs warn', async () => {
  const home = tempHome();
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const calls = { info: [], warn: [] };
  const service = createProviderLiveSyncService({
    homedir: () => home,
    ...createLogger(calls),
    claudeAdapter: {
      sync: () => {
        throw new Error('adapter failed');
      },
    },
  });

  const result = await service.syncProviderLiveConfig({
    provider: 'claude',
    profile: { id: 'profile-1' },
    env: {},
    source: 'manual-test',
  });

  assert.equal(result.ok, false);
  assert.ok(result.error instanceof Error);
  assert.equal(result.message, 'adapter failed');
  assert.equal(calls.warn.length, 1);
  assert.equal(calls.warn[0][1], 'Failed to sync provider live config');
});

test('missing adapter returns adapter-not-configured when config dir exists', async () => {
  const home = tempHome();
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
  const calls = { info: [], warn: [] };
  const service = createProviderLiveSyncService({
    homedir: () => home,
    ...createLogger(calls),
  });

  const result = await service.syncProviderLiveConfig({
    provider: 'gemini',
    profile: { id: 'gemini-profile' },
    env: {},
    source: 'manual-test',
  });

  assert.deepEqual(result, {
    ok: true,
    skipped: true,
    reason: 'adapter-not-configured',
  });
  assert.equal(calls.info.length, 0);
  assert.equal(calls.warn.length, 0);
});

test('when codex and gemini config dirs exist, their adapters receive their provider paths', async () => {
  const home = tempHome();
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
  const calls = { info: [], warn: [] };
  const captured = [];
  const service = createProviderLiveSyncService({
    homedir: () => home,
    ...createLogger(calls),
    codexAdapter: {
      sync: async (input) => {
        captured.push({ provider: 'codex', input });
        return { ok: true };
      },
    },
    geminiAdapter: {
      sync: async (input) => {
        captured.push({ provider: 'gemini', input });
        return { ok: true };
      },
    },
  });

  const codexResult = await service.syncProviderLiveConfig({
    provider: 'codex',
    profile: { id: 'codex-profile' },
    env: { OPENAI_API_KEY: 'sk-codex' },
    source: 'codex-test',
  });
  const geminiResult = await service.syncProviderLiveConfig({
    provider: 'gemini',
    profile: { id: 'gemini-profile' },
    env: { GEMINI_API_KEY: 'sk-gemini' },
    source: 'gemini-test',
  });

  assert.deepEqual(codexResult, { ok: true });
  assert.deepEqual(geminiResult, { ok: true });
  assert.equal(captured.length, 2);
  assert.equal(captured[0].provider, 'codex');
  assert.equal(captured[0].input.paths.codexDir(), path.join(home, '.codex'));
  assert.equal(captured[0].input.paths.codexAuthPath(), path.join(home, '.codex', 'auth.json'));
  assert.equal(captured[0].input.paths.codexConfigPath(), path.join(home, '.codex', 'config.toml'));
  assert.equal(captured[1].provider, 'gemini');
  assert.equal(captured[1].input.paths.geminiDir(), path.join(home, '.gemini'));
  assert.equal(captured[1].input.paths.geminiEnvPath(), path.join(home, '.gemini', '.env'));
  assert.equal(
    captured[1].input.paths.geminiSettingsPath(),
    path.join(home, '.gemini', 'settings.json'),
  );
  assert.equal(calls.warn.length, 0);
});

test('primitive adapter results are normalized into an object', async () => {
  const home = tempHome();
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
  const calls = { info: [], warn: [] };
  const service = createProviderLiveSyncService({
    homedir: () => home,
    ...createLogger(calls),
    geminiAdapter: {
      sync: async () => 'ok',
    },
  });

  const result = await service.syncProviderLiveConfig({
    provider: 'gemini',
    profile: { id: 'gemini-profile' },
    env: {},
    source: 'manual-test',
  });

  assert.deepEqual(result, { ok: true, value: 'ok' });
  assert.equal(calls.warn.length, 0);
});
