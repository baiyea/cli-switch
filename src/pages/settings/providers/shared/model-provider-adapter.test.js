const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEnvPairsFromModelProfile,
  normalizeModelProviderProfile,
  resolveModelProviderAuthMode,
} = require('./model-provider-adapter');

test('normalizeModelProviderProfile converts legacy envVars into settingsConfig.env', () => {
  const profile = normalizeModelProviderProfile('claude', {
    id: 'deepseek-api',
    name: 'DeepSeek API',
    envVars: [
      { key: 'ANTHROPIC_AUTH_TOKEN', value: 'sk-test' },
      { key: 'ANTHROPIC_BASE_URL', value: 'https://api.deepseek.com/anthropic' },
      { key: 'ANTHROPIC_MODEL', value: 'deepseek-v4-pro[1m]' },
    ],
  });

  assert.equal(profile.cliProvider, 'claude');
  assert.equal(profile.id, 'deepseek-api');
  assert.equal(profile.name, 'DeepSeek API');
  assert.deepEqual(profile.settingsConfig.env, {
    ANTHROPIC_AUTH_TOKEN: 'sk-test',
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
  });
  assert.equal(profile.meta.apiKeyField, 'ANTHROPIC_AUTH_TOKEN');
  assert.equal(profile.meta.apiFormat, 'anthropic');
});

test('normalizeModelProviderProfile preserves explicit settingsConfig and meta', () => {
  const profile = normalizeModelProviderProfile('codex', {
    id: 'vendor',
    name: 'Vendor',
    settingsConfig: {
      auth: { OPENAI_API_KEY: 'sk-vendor' },
      config: 'model_provider = "vendor"\n',
    },
    meta: {
      apiFormat: 'openai_responses',
      codexOfficial: false,
    },
  });

  assert.equal(profile.cliProvider, 'codex');
  assert.equal(profile.settingsConfig.auth.OPENAI_API_KEY, 'sk-vendor');
  assert.equal(profile.settingsConfig.config, 'model_provider = "vendor"\n');
  assert.equal(profile.meta.apiFormat, 'openai_responses');
  assert.equal(profile.meta.codexOfficial, false);
});

test('normalizeModelProviderProfile accepts template metadata fields', () => {
  const profile = normalizeModelProviderProfile('claude', {
    id: 'deepseek-api',
    name: 'DeepSeek API',
    category: 'cn_official',
    icon: 'deepseek',
    iconColor: '#1E88E5',
    websiteUrl: 'https://platform.deepseek.com',
    settingsConfig: {
      env: {
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      },
    },
    meta: {
      apiFormat: 'anthropic',
      testConfig: {
        enabled: true,
        testModel: 'deepseek-v4-flash',
      },
    },
  });

  assert.equal(profile.category, 'cn_official');
  assert.equal(profile.icon, 'deepseek');
  assert.equal(profile.iconColor, '#1E88E5');
  assert.equal(profile.websiteUrl, 'https://platform.deepseek.com');
  assert.equal(profile.meta.testConfig.enabled, true);
});

test('buildEnvPairsFromModelProfile projects settingsConfig.env back to env pairs', () => {
  const pairs = buildEnvPairsFromModelProfile({
    settingsConfig: {
      env: {
        GEMINI_API_KEY: 'gemini-key',
        GEMINI_MODEL: 'gemini-2.5-pro',
      },
    },
  });

  assert.deepEqual(pairs, [
    { key: 'GEMINI_API_KEY', value: 'gemini-key' },
    { key: 'GEMINI_MODEL', value: 'gemini-2.5-pro' },
  ]);
});

test('buildEnvPairsFromModelProfile rejects non-env settingsConfig without projection', () => {
  assert.throws(
    () =>
      buildEnvPairsFromModelProfile({
        settingsConfig: {
          auth: { OPENAI_API_KEY: 'sk-vendor' },
          config: 'model_provider = "vendor"\n',
        },
      }),
    /Cannot project non-env settingsConfig/,
  );
});

test('resolveModelProviderAuthMode detects oauth profiles', () => {
  const profile = normalizeModelProviderProfile('gemini', {
    id: 'oauth-login',
    envVars: [{ key: 'ZEELIN_AUTH_MODE', value: 'oauth' }],
  });

  assert.equal(resolveModelProviderAuthMode(profile), 'oauth');
});
