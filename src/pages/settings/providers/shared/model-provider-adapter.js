const AUTH_MODE_OAUTH = 'oauth';
const INTERNAL_ENV_KEY_AUTH_MODE = 'ZEELIN_AUTH_MODE';

const DEFAULT_API_FORMAT_BY_CLI_PROVIDER = {
  claude: 'anthropic',
  codex: 'openai_responses',
  gemini: 'gemini_native',
};

function normalizeCliProvider(cliProvider) {
  const value = String(cliProvider || '').toLowerCase();
  if (value === 'claude' || value === 'codex' || value === 'gemini') return value;
  return 'claude';
}

function envPairsToObject(envVars = []) {
  const env = {};
  if (!Array.isArray(envVars)) return env;

  for (const pair of envVars) {
    const key = String(pair?.key || '').trim();
    if (!key) continue;
    env[key] = String(pair?.value ?? '');
  }

  return env;
}

function objectToEnvPairs(env = {}) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return [];

  return Object.entries(env)
    .filter(([key]) => String(key || '').trim())
    .map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    }));
}

function buildEnvPairsFromModelProfile(profile = {}) {
  const settingsConfig = profile?.settingsConfig;
  if (settingsConfig && typeof settingsConfig === 'object' && !Array.isArray(settingsConfig)) {
    const nonEnvKeys = Object.keys(settingsConfig).filter((key) => key !== 'env');
    if (nonEnvKeys.length > 0) {
      throw new Error('Cannot project non-env settingsConfig into envVars');
    }
  }

  const env = settingsConfig?.env;
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    return objectToEnvPairs(env);
  }

  return Array.isArray(profile?.envVars)
    ? profile.envVars.map((pair) => ({
        key: String(pair?.key || ''),
        value: String(pair?.value ?? ''),
      }))
    : [];
}

function resolveDefaultApiKeyField(cliProvider, env) {
  if (cliProvider === 'codex') return 'OPENAI_API_KEY';
  if (cliProvider === 'gemini') return 'GEMINI_API_KEY';
  if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_API_KEY')) {
    return 'ANTHROPIC_API_KEY';
  }
  return 'ANTHROPIC_AUTH_TOKEN';
}

function normalizeModelProviderProfile(cliProvider, profile = {}) {
  const normalizedCliProvider = normalizeCliProvider(cliProvider);
  const legacyEnv = envPairsToObject(profile?.envVars || []);
  const explicitSettingsConfig =
    profile?.settingsConfig && typeof profile.settingsConfig === 'object'
      ? profile.settingsConfig
      : null;
  const settingsConfig = explicitSettingsConfig || { env: legacyEnv };
  const settingsEnv =
    settingsConfig.env && typeof settingsConfig.env === 'object' && !Array.isArray(settingsConfig.env)
      ? settingsConfig.env
      : legacyEnv;
  const defaultMeta = {
    apiKeyField: resolveDefaultApiKeyField(normalizedCliProvider, settingsEnv),
    apiFormat: DEFAULT_API_FORMAT_BY_CLI_PROVIDER[normalizedCliProvider],
  };

  return {
    ...profile,
    cliProvider: normalizedCliProvider,
    settingsConfig,
    meta: {
      ...defaultMeta,
      ...(profile?.meta || {}),
    },
  };
}

function resolveModelProviderAuthMode(profile = {}) {
  const env = profile?.settingsConfig?.env || envPairsToObject(profile?.envVars || []);
  const authMode = String(env?.[INTERNAL_ENV_KEY_AUTH_MODE] || '').trim().toLowerCase();
  return authMode === AUTH_MODE_OAUTH ? AUTH_MODE_OAUTH : 'api-key';
}

function isOAuthModelProviderProfile(profile = {}) {
  return resolveModelProviderAuthMode(profile) === AUTH_MODE_OAUTH;
}

module.exports = {
  AUTH_MODE_OAUTH,
  INTERNAL_ENV_KEY_AUTH_MODE,
  buildEnvPairsFromModelProfile,
  envPairsToObject,
  isOAuthModelProviderProfile,
  normalizeCliProvider,
  normalizeModelProviderProfile,
  objectToEnvPairs,
  resolveModelProviderAuthMode,
};
