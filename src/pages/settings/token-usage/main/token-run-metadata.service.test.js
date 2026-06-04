const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveModelName,
  resolveApiBaseHost,
  fingerprintEnv,
  createTokenRunMetadataResolver,
} = require('./token-run-metadata.service');

test('resolveModelName prefers provider-specific model env keys before MODEL', () => {
  assert.equal(resolveModelName('claude', { ANTHROPIC_MODEL: 'claude-3-7', MODEL: 'fallback' }), 'claude-3-7');
  assert.equal(resolveModelName('codex', { OPENAI_MODEL: 'gpt-5', MODEL: 'fallback' }), 'gpt-5');
  assert.equal(resolveModelName('gemini', { GEMINI_MODEL: 'gemini-2.5', MODEL: 'fallback' }), 'gemini-2.5');
  assert.equal(resolveModelName('claude', { ANTHROPIC_MODEL: ' ', MODEL: 'fallback' }), 'fallback');
  assert.equal(resolveModelName('codex', {}), 'unknown');
});

test('resolveApiBaseHost stores host and preserves provider compatibility path segment', () => {
  assert.equal(
    resolveApiBaseHost({ ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic/v1' }),
    'api.deepseek.com/anthropic',
  );
  assert.equal(resolveApiBaseHost({ OPENAI_BASE_URL: 'https://api.openai.com/v1' }), 'api.openai.com');
  assert.equal(resolveApiBaseHost({ GEMINI_BASE_URL: 'https://example.test/gemini/v1beta' }), 'example.test/gemini');
  assert.equal(resolveApiBaseHost({ GOOGLE_GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta' }), 'generativelanguage.googleapis.com');
  assert.equal(resolveApiBaseHost({ BASE_URL: 'not a url' }), 'not a url');
  assert.equal(resolveApiBaseHost({}), 'unknown');
});

test('fingerprintEnv ignores secrets and is stable across key order', () => {
  const first = fingerprintEnv({
    OPENAI_API_KEY: 'secret-a',
    OPENAI_MODEL: 'gpt-5',
    BASE_URL: 'https://api.example.com/v1',
    AUTH_TOKEN: 'secret-b',
  });
  const second = fingerprintEnv({
    AUTH_TOKEN: 'changed-secret',
    BASE_URL: 'https://api.example.com/v1',
    OPENAI_MODEL: 'gpt-5',
    OPENAI_API_KEY: 'changed-secret',
  });
  const changed = fingerprintEnv({
    BASE_URL: 'https://api.other.test/v1',
    OPENAI_MODEL: 'gpt-5',
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{24}$/);
  assert.notEqual(first, changed);
});

test('createTokenRunMetadataResolver combines active profile env vars with startup env', () => {
  const resolveMetadata = createTokenRunMetadataResolver({
    normalizeProviderId: (provider) => String(provider || '').trim().toLowerCase() || 'claude',
    getActiveProviderProfile: (provider) => ({
      providerId: provider,
      profileId: 'profile-1',
      profileName: 'Work Profile',
      envVars: [
        { key: 'MODEL', value: 'fallback-model' },
        { key: 'ANTHROPIC_BASE_URL', value: 'https://profile.example.com/v1' },
      ],
    }),
    getStartupEnvForProvider: () => ({
      ANTHROPIC_MODEL: 'claude-opus',
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic/v1',
      ANTHROPIC_AUTH_TOKEN: 'secret',
    }),
  });

  const result = resolveMetadata('claude');

  assert.equal(result.provider, 'claude');
  assert.equal(result.profileId, 'profile-1');
  assert.equal(result.profileName, 'Work Profile');
  assert.equal(result.modelName, 'claude-opus');
  assert.equal(result.apiBaseHost, 'api.deepseek.com/anthropic');
  assert.match(result.envFingerprint, /^[a-f0-9]{24}$/);
});
