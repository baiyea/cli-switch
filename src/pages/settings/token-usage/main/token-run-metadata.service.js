const crypto = require('node:crypto');

const MODEL_KEYS_BY_PROVIDER = {
  claude: ['ANTHROPIC_MODEL', 'MODEL'],
  codex: ['OPENAI_MODEL', 'MODEL'],
  gemini: ['GEMINI_MODEL', 'MODEL'],
};

const API_BASE_KEYS = [
  'ANTHROPIC_BASE_URL',
  'OPENAI_BASE_URL',
  'GEMINI_BASE_URL',
  'GOOGLE_GEMINI_BASE_URL',
  'BASE_URL',
];

const FINGERPRINT_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'BASE_URL',
  'GEMINI_BASE_URL',
  'GEMINI_MODEL',
  'GOOGLE_GEMINI_BASE_URL',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'ZEELIN_AUTH_MODE',
];

const COMPAT_PATH_SEGMENTS = new Set(['anthropic', 'openai', 'gemini']);
const URL_FINGERPRINT_KEYS = new Set([
  'ANTHROPIC_BASE_URL',
  'BASE_URL',
  'GEMINI_BASE_URL',
  'GOOGLE_GEMINI_BASE_URL',
  'OPENAI_BASE_URL',
]);
const PROXY_FINGERPRINT_KEYS = new Set(['HTTP_PROXY', 'HTTPS_PROXY']);

function normalizeEnvValue(value) {
  return String(value || '').trim();
}

function resolveModelName(provider, env = {}) {
  const id = String(provider || '').trim().toLowerCase();
  const keys = MODEL_KEYS_BY_PROVIDER[id] || ['MODEL'];
  for (const key of keys) {
    const value = normalizeEnvValue(env?.[key]);
    if (value) return value;
  }
  return 'unknown';
}

function parseBaseUrl(rawValue) {
  const raw = normalizeEnvValue(rawValue);
  if (!raw) return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    return new URL(withProtocol);
  } catch (_error) {
    return null;
  }
}

function sanitizeHostCandidate(rawValue) {
  let value = normalizeEnvValue(rawValue);
  if (!value) return '';
  value = value.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
  value = value.split('#')[0].split('?')[0];
  value = value.includes('@') ? value.slice(value.lastIndexOf('@') + 1) : value;
  value = value.split('/')[0].trim();
  if (!value || /\s/.test(value)) return '';
  return value;
}

function compactBaseHost(rawValue) {
  const raw = normalizeEnvValue(rawValue);
  const parsed = parseBaseUrl(raw);
  if (!parsed) return sanitizeHostCandidate(raw);

  const firstSegment = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)[0];
  const host = parsed.host || raw;
  if (firstSegment && COMPAT_PATH_SEGMENTS.has(firstSegment.toLowerCase())) {
    return `${host}/${firstSegment.toLowerCase()}`;
  }
  return host;
}

function resolveApiBaseHost(env = {}) {
  for (const key of API_BASE_KEYS) {
    const value = normalizeEnvValue(env?.[key]);
    if (value) return compactBaseHost(value) || 'unknown';
  }
  return 'unknown';
}

function normalizeProxyHost(value) {
  const raw = normalizeEnvValue(value);
  const parsed = parseBaseUrl(raw);
  if (parsed?.host) return parsed.host;
  return sanitizeHostCandidate(raw);
}

function isSecretEnvKey(key) {
  return /(?:^|_)(?:.*TOKEN|.*SECRET|.*PASSWORD|.*CREDENTIALS?|.*API_?KEY|.*PRIVATE_?KEY)(?:_|$)/i.test(
    String(key || ''),
  );
}

function fingerprintEnv(env = {}) {
  const pairs = [];
  for (const key of FINGERPRINT_ENV_KEYS) {
    if (isSecretEnvKey(key)) continue;
    const value = normalizeFingerprintValue(key, env?.[key]);
    if (!value) continue;
    pairs.push([key, value]);
  }
  pairs.sort(([left], [right]) => left.localeCompare(right));
  return crypto.createHash('sha256').update(JSON.stringify(pairs)).digest('hex').slice(0, 24);
}

function normalizeFingerprintValue(key, value) {
  if (URL_FINGERPRINT_KEYS.has(key)) {
    const host = resolveApiBaseHost({ [key]: value });
    return host === 'unknown' ? '' : host;
  }
  if (PROXY_FINGERPRINT_KEYS.has(key)) {
    return normalizeProxyHost(value);
  }
  return normalizeEnvValue(value);
}

function envFromPairs(pairs = []) {
  const env = {};
  for (const pair of pairs || []) {
    const key = normalizeEnvValue(pair?.key);
    if (!key) continue;
    env[key] = String(pair?.value || '');
  }
  return env;
}

function createTokenRunMetadataResolver({
  normalizeProviderId,
  getActiveProviderProfile,
  getStartupEnvForProvider,
}) {
  return function resolveTokenRunMetadata(provider = 'claude') {
    const providerId = normalizeProviderId
      ? normalizeProviderId(provider)
      : String(provider || 'claude').trim().toLowerCase() || 'claude';
    const profile = getActiveProviderProfile ? getActiveProviderProfile(providerId) || {} : {};
    const profileEnv = envFromPairs(profile.envVars || []);
    const startupEnv = getStartupEnvForProvider ? getStartupEnvForProvider(providerId) || {} : {};
    const env = { ...profileEnv, ...startupEnv };

    return {
      provider: providerId,
      profileId: String(profile.profileId || ''),
      profileName: String(profile.profileName || profile.profileId || ''),
      modelName: resolveModelName(providerId, env),
      apiBaseHost: resolveApiBaseHost(env),
      envFingerprint: fingerprintEnv(env),
    };
  };
}

module.exports = {
  resolveModelName,
  resolveApiBaseHost,
  fingerprintEnv,
  createTokenRunMetadataResolver,
};
