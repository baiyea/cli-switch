const { spawnSync } = require('node:child_process');

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function shortBody(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function shortBodyLong(text, maxLen = 800) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function isDeepSeekAnthropicBase(baseUrl = '') {
  const text = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!text) return false;
  try {
    const parsed = new URL(text);
    const host = String(parsed.hostname || '').toLowerCase();
    const pathname = String(parsed.pathname || '').toLowerCase();
    return host === 'api.deepseek.com' && pathname.startsWith('/anthropic');
  } catch {
    return /api\.deepseek\.com\/anthropic/i.test(text);
  }
}

function buildAnthropicCompatHeaders({
  apiKey = '',
  authToken = '',
  base = '',
  includeJsonContentType = false,
} = {}) {
  const headers = {
    'anthropic-version': '2023-06-01',
  };
  if (includeJsonContentType) {
    headers['content-type'] = 'application/json';
  }
  const normalizedApiKey = String(apiKey || '').trim();
  const normalizedAuthToken = String(authToken || '').trim();
  const rawApiKey = normalizedApiKey.replace(/^Bearer\s+/i, '').trim();
  const rawAuthToken = normalizedAuthToken.replace(/^Bearer\s+/i, '').trim();
  const deepSeekBase = isDeepSeekAnthropicBase(base);
  if (deepSeekBase) {
    const deepSeekToken = rawApiKey || rawAuthToken;
    if (deepSeekToken) {
      headers['x-api-key'] = deepSeekToken;
      headers.Authorization = `Bearer ${deepSeekToken}`;
    }
  } else {
    if (rawApiKey) {
      headers['x-api-key'] = rawApiKey;
    }
    if (rawAuthToken) {
      headers.Authorization = /^Bearer\s+/i.test(normalizedAuthToken)
        ? normalizedAuthToken
        : `Bearer ${rawAuthToken}`;
    }
  }
  return { headers, deepSeekBase };
}

function maskSecret(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.replace(/^Bearer\s+/i, '');
  if (normalized.length <= 8) return '*'.repeat(Math.max(4, normalized.length));
  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function maskEnvForLog(env = {}) {
  const result = {};
  for (const key of Object.keys(env).sort()) {
    const value = String(env[key] ?? '').trim();
    if (!value) continue;
    if (/(key|token|secret|password)/i.test(key)) {
      result[key] = maskSecret(value);
      continue;
    }
    result[key] = shortBody(value);
  }
  return result;
}

function createRunCommandWithEnv({
  authModeEnvKey = 'ZEELIN_AUTH_MODE',
  oauthAuthMode = 'oauth',
  platform = process.platform,
  shell = process.env.SHELL || '/bin/zsh',
} = {}) {
  return function runCommandWithEnv(command, env = {}, timeoutMs = 12000) {
    const shellCommand = String(command || '').trim();
    if (!shellCommand) {
      return {
        ok: false,
        timedOut: false,
        exitCode: null,
        stdout: '',
        stderr: 'empty command',
      };
    }

    const childEnv = { ...process.env, ...(env || {}) };
    const authMode = String(childEnv[authModeEnvKey] || '')
      .trim()
      .toLowerCase();
    if (authMode === oauthAuthMode) {
      delete childEnv.GEMINI_API_KEY;
      delete childEnv.GOOGLE_API_KEY;
      delete childEnv.OPENAI_API_KEY;
      delete childEnv.ANTHROPIC_API_KEY;
      delete childEnv.ANTHROPIC_AUTH_TOKEN;
    }
    const options = {
      env: childEnv,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 4,
      input: '',
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    const isWin = platform === 'win32';
    const result = isWin
      ? spawnSync(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', shellCommand],
          options,
        )
      : spawnSync(shell, ['-lc', shellCommand], options);

    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    const exitCode = typeof result.status === 'number' ? result.status : null;
    const timedOut = !!result.error && result.error.code === 'ETIMEDOUT';
    const ok = !timedOut && !result.error && exitCode === 0;

    return { ok, timedOut, exitCode, stdout, stderr };
  };
}

module.exports = {
  fetchWithTimeout,
  shortBody,
  shortBodyLong,
  isDeepSeekAnthropicBase,
  buildAnthropicCompatHeaders,
  maskSecret,
  maskEnvForLog,
  createRunCommandWithEnv,
};
