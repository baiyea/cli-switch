const test = require('node:test');
const assert = require('node:assert/strict');

const { createProviderTestSyncService } = require('./provider-test-sync.service');

test('syncCliConfigAfterSuccessfulProviderTest also syncs provider live config', () => {
  const calls = [];
  const service = createProviderTestSyncService({
    normalizeProviderId: (value) => String(value || '').toLowerCase(),
    getMergedProviderProfileEnvVars: () => [{ key: 'OPENAI_API_KEY', value: 'sk-test' }],
    applyProviderStartupEnv: (provider, env) => ({ ...env, APPLIED_FOR: provider }),
    applyUnifiedProxyEnv: (env) => env,
    buildEnvFromPairs: (pairs) =>
      Object.fromEntries((pairs || []).map((pair) => [pair.key, pair.value])),
    cliConfigSyncService: {
      syncProviderCliConfig: (payload) => {
        calls.push({ type: 'cli', payload });
        return { ok: true, cli: true };
      },
    },
    providerLiveSyncService: {
      syncProviderLiveConfig: (payload) => {
        calls.push({ type: 'live', payload });
        return { ok: true, live: true };
      },
    },
  });

  const result = service.syncCliConfigAfterSuccessfulProviderTest(
    {
      provider: 'codex',
      profileId: 'openai-api-key',
      envVars: [{ key: 'OPENAI_API_KEY', value: 'sk-test' }],
    },
    'provider-test',
  );

  assert.deepEqual(result, { ok: true, cli: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'cli');
  assert.equal(calls[1].type, 'live');
  assert.equal(calls[1].payload.provider, 'codex');
  assert.equal(calls[1].payload.profile.id, 'openai-api-key');
  assert.equal(calls[1].payload.env.OPENAI_API_KEY, 'sk-test');
  assert.equal(calls[1].payload.env.APPLIED_FOR, 'codex');
});

test('syncCliConfigAfterSuccessfulProviderTest returns live failures when live sync fails', () => {
  const service = createProviderTestSyncService({
    normalizeProviderId: (value) => String(value || '').toLowerCase(),
    getMergedProviderProfileEnvVars: () => [{ key: 'GEMINI_API_KEY', value: 'sk-test' }],
    applyProviderStartupEnv: (_provider, env) => env,
    applyUnifiedProxyEnv: (env) => env,
    buildEnvFromPairs: (pairs) =>
      Object.fromEntries((pairs || []).map((pair) => [pair.key, pair.value])),
    cliConfigSyncService: {
      syncProviderCliConfig: () => ({ ok: true, cli: true }),
    },
    providerLiveSyncService: {
      syncProviderLiveConfig: () => ({ ok: false, message: 'live failed' }),
    },
  });

  const result = service.syncCliConfigAfterSuccessfulProviderTest(
    {
      provider: 'gemini',
      profileId: 'api-key',
      envVars: [{ key: 'GEMINI_API_KEY', value: 'sk-test' }],
    },
    'provider-test',
  );

  assert.deepEqual(result, { ok: false, message: 'live failed' });
});
