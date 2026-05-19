const PROVIDERS = Object.freeze({
  CLAUDE: 'claude',
  CODEX: 'codex',
  GEMINI: 'gemini',
});

const path = require('node:path');
const fs = require('node:fs');
const { getProviderUpdateDisableEnv } = require('./cli-config-sync-service');

function normalizeProviderId(provider) {
  const value = String(provider || PROVIDERS.CLAUDE).toLowerCase();
  if (value.includes(PROVIDERS.CODEX)) return PROVIDERS.CODEX;
  if (value.includes(PROVIDERS.GEMINI)) return PROVIDERS.GEMINI;
  return PROVIDERS.CLAUDE;
}

function quotePosix(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function quotePowerShell(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function fileExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function resolveProjectRoot() {
  return path.resolve(__dirname, '../../../../..');
}

function normalizeArch(arch) {
  const value = String(arch || process.arch).toLowerCase();
  if (value === 'x64' || value === 'arm64') return value;
  return value;
}

function normalizePlatform(platform) {
  const value = String(platform || process.platform).toLowerCase();
  if (value === 'win32' || value === 'darwin' || value === 'linux') return value;
  return value;
}

function platformKey(platform = process.platform, arch = process.arch) {
  return `${normalizePlatform(platform)}-${normalizeArch(arch)}`;
}

function codexTargetTriple(platform = process.platform, arch = process.arch) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedArch = normalizeArch(arch);
  if (normalizedPlatform === 'win32' && normalizedArch === 'x64') return 'x86_64-pc-windows-msvc';
  if (normalizedPlatform === 'win32' && normalizedArch === 'arm64')
    return 'aarch64-pc-windows-msvc';
  if (normalizedPlatform === 'darwin' && normalizedArch === 'x64') return 'x86_64-apple-darwin';
  if (normalizedPlatform === 'darwin' && normalizedArch === 'arm64') return 'aarch64-apple-darwin';
  if (normalizedPlatform === 'linux' && normalizedArch === 'x64')
    return 'x86_64-unknown-linux-musl';
  if (normalizedPlatform === 'linux' && normalizedArch === 'arm64')
    return 'aarch64-unknown-linux-musl';
  return '';
}

function codexPlatformPackage(platform = process.platform, arch = process.arch) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedArch = normalizeArch(arch);
  if (normalizedPlatform === 'win32')
    return normalizedArch === 'arm64' ? '@openai/codex-win32-arm64' : '@openai/codex-win32-x64';
  if (normalizedPlatform === 'darwin')
    return normalizedArch === 'arm64' ? '@openai/codex-darwin-arm64' : '@openai/codex-darwin-x64';
  if (normalizedPlatform === 'linux')
    return normalizedArch === 'arm64' ? '@openai/codex-linux-arm64' : '@openai/codex-linux-x64';
  return '';
}

function resolveCliRuntimeDir() {
  const key = platformKey();
  const candidates = [
    process.env.ZEELIN_CLI_RUNTIME_DIR || '',
    path.join(process.resourcesPath || '', 'cli-runtime', key),
    path.join(resolveProjectRoot(), 'build', 'cli-runtime', key),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return '';
}

function resolveCliEntrypoint(provider, runtimeDir) {
  const roots = [runtimeDir, resolveProjectRoot()].filter(Boolean);
  for (const root of roots) {
    const entryByProvider = {
      [PROVIDERS.CLAUDE]: path.join(root, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
      [PROVIDERS.CODEX]: path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
      [PROVIDERS.GEMINI]: path.join(
        root,
        'node_modules',
        '@google',
        'gemini-cli',
        'dist',
        'index.js',
      ),
    };
    const target = entryByProvider[provider];
    if (target && fileExists(target)) return target;
  }
  return '';
}

function resolveNodeRuntime(runtimeDir) {
  const candidates = [
    runtimeDir
      ? path.join(runtimeDir, 'node-runtime', process.platform === 'win32' ? 'node.exe' : 'node')
      : '',
    process.execPath,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return process.execPath;
}

function resolveCodexNativeBinary(runtimeDir) {
  const platformPackage = codexPlatformPackage();
  const triple = codexTargetTriple();
  if (!platformPackage || !triple) return { binary: '', pathDir: '' };

  const roots = [runtimeDir, resolveProjectRoot()].filter(Boolean);
  for (const root of roots) {
    const vendorRoot = path.join(
      root,
      'node_modules',
      ...platformPackage.split('/'),
      'vendor',
      triple,
    );
    const binary = path.join(
      vendorRoot,
      'codex',
      process.platform === 'win32' ? 'codex.exe' : 'codex',
    );
    if (fileExists(binary)) {
      return {
        binary,
        pathDir: path.join(vendorRoot, 'path'),
      };
    }
  }

  return { binary: '', pathDir: '' };
}

function buildNodeRunnerCommand(entrypoint, args = [], nodeExecutable = process.execPath) {
  if (!entrypoint) return '';
  const isWin = process.platform === 'win32';
  const quote = isWin ? quotePowerShell : quotePosix;
  const joinedArgs = [entrypoint, ...args].map((item) => quote(item)).join(' ');
  const eol = isWin ? '\r' : '\n';
  const base = isWin
    ? `& ${quote(nodeExecutable)} ${joinedArgs}${eol}`
    : `${quote(nodeExecutable)} ${joinedArgs}${eol}`;
  // When nodeExecutable is Electron (dev runtime fallback), force Node mode
  // so provider CLIs do not appear as extra Electron GUI apps in the dock.
  return prependEnvForCommand(base, { ELECTRON_RUN_AS_NODE: '1' });
}

function buildExecutableCommand(executable, args = [], envMap = {}) {
  if (!executable) return '';
  const isWin = process.platform === 'win32';
  const quote = isWin ? quotePowerShell : quotePosix;
  const eol = isWin ? '\r' : '\n';
  const command = isWin
    ? `& ${quote(executable)} ${args.map((item) => quote(item)).join(' ')}${eol}`
    : `${quote(executable)} ${args.map((item) => quote(item)).join(' ')}${eol}`;
  return prependEnvForCommand(command, envMap);
}

function prependEnvForCommand(command, envMap = {}) {
  const base = String(command || '');
  if (!base.trim()) return base;
  const entries = Object.entries(envMap)
    .map(([key, value]) => [String(key || '').trim(), String(value ?? '')])
    .filter(([key]) => !!key);
  if (entries.length === 0) return base;
  const isWin = process.platform === 'win32';
  if (isWin) {
    const prefix = entries
      .map(([key, value]) => `$env:${key}=${quotePowerShell(value)};`)
      .join(' ');
    return `${prefix} ${base}`;
  }
  const prefix = entries.map(([key, value]) => `${key}=${quotePosix(value)}`).join(' ');
  return `${prefix} ${base}`;
}

function getLaunchCommandForProvider(provider) {
  const id = normalizeProviderId(provider);
  const runtimeDir = resolveCliRuntimeDir();
  if (id === PROVIDERS.CODEX) {
    const { binary, pathDir } = resolveCodexNativeBinary(runtimeDir);
    return buildExecutableCommand(
      binary,
      ['--dangerously-bypass-approvals-and-sandbox'],
      fileExists(pathDir) ? { PATH: `${pathDir}${path.delimiter}${process.env.PATH || ''}` } : {},
    );
  }
  const entrypoint = resolveCliEntrypoint(id, runtimeDir);
  const nodeRuntime = resolveNodeRuntime(runtimeDir);
  if (!entrypoint) return '';
  if (id === PROVIDERS.CLAUDE)
    return buildNodeRunnerCommand(entrypoint, ['--dangerously-skip-permissions'], nodeRuntime);
  if (id === PROVIDERS.GEMINI)
    return buildNodeRunnerCommand(entrypoint, ['--approval-mode', 'yolo'], nodeRuntime);
  return '';
}

function getOAuthLoginCommandForProvider(provider) {
  const id = normalizeProviderId(provider);
  const runtimeDir = resolveCliRuntimeDir();
  if (id === PROVIDERS.CODEX) {
    const { binary, pathDir } = resolveCodexNativeBinary(runtimeDir);
    return buildExecutableCommand(
      binary,
      ['login'],
      fileExists(pathDir) ? { PATH: `${pathDir}${path.delimiter}${process.env.PATH || ''}` } : {},
    );
  }
  const entrypoint = resolveCliEntrypoint(id, runtimeDir);
  const nodeRuntime = resolveNodeRuntime(runtimeDir);
  if (!entrypoint) return '';
  if (id === PROVIDERS.CLAUDE)
    return buildNodeRunnerCommand(entrypoint, ['auth', 'login'], nodeRuntime);
  if (id === PROVIDERS.GEMINI) {
    const base = buildNodeRunnerCommand(entrypoint, [], nodeRuntime);
    return prependEnvForCommand(base, {
      NO_BROWSER: 'true',
      BROWSER: '',
    });
  }
  return '';
}

function getOAuthProbeCommandForProvider(provider) {
  const id = normalizeProviderId(provider);
  const runtimeDir = resolveCliRuntimeDir();
  if (id === PROVIDERS.CODEX) {
    const { binary, pathDir } = resolveCodexNativeBinary(runtimeDir);
    return buildExecutableCommand(
      binary,
      ['login', 'status'],
      fileExists(pathDir) ? { PATH: `${pathDir}${path.delimiter}${process.env.PATH || ''}` } : {},
    );
  }
  const entrypoint = resolveCliEntrypoint(id, runtimeDir);
  const nodeRuntime = resolveNodeRuntime(runtimeDir);
  if (!entrypoint) return '';
  if (id === PROVIDERS.CLAUDE)
    return buildNodeRunnerCommand(
      entrypoint,
      ['-p', 'ping', '--output-format', 'json'],
      nodeRuntime,
    );
  // Gemini CLI v0.34+ may reject `-p/--prompt` in some adapter flows with
  // "Cannot use both a positional prompt and the --prompt flag together".
  // Use positional prompt probe to avoid this conflict.
  if (id === PROVIDERS.GEMINI)
    return buildNodeRunnerCommand(entrypoint, ['--output-format', 'json', 'ping'], nodeRuntime);
  return '';
}

function isLocalGeneratedSessionId(provider, sessionId) {
  const id = normalizeProviderId(provider);
  const sid = String(sessionId || '').trim();
  return new RegExp(`^${id}-\\d+-[a-f0-9]+$`, 'i').test(sid);
}

function getResumeCommandForProvider(provider, sessionId) {
  const id = normalizeProviderId(provider);
  const sid = String(sessionId || '').trim();
  if (!sid) return '';
  if (isLocalGeneratedSessionId(id, sid)) return '';
  const runtimeDir = resolveCliRuntimeDir();
  if (id === PROVIDERS.CODEX) {
    const { binary, pathDir } = resolveCodexNativeBinary(runtimeDir);
    return buildExecutableCommand(
      binary,
      ['resume', sid, '--dangerously-bypass-approvals-and-sandbox'],
      fileExists(pathDir) ? { PATH: `${pathDir}${path.delimiter}${process.env.PATH || ''}` } : {},
    );
  }
  const entrypoint = resolveCliEntrypoint(id, runtimeDir);
  const nodeRuntime = resolveNodeRuntime(runtimeDir);
  if (!entrypoint) return '';
  if (id === PROVIDERS.CLAUDE)
    return buildNodeRunnerCommand(
      entrypoint,
      ['--dangerously-skip-permissions', '-r', sid],
      nodeRuntime,
    );
  if (id === PROVIDERS.GEMINI)
    return buildNodeRunnerCommand(
      entrypoint,
      ['--approval-mode', 'yolo', '--resume', sid],
      nodeRuntime,
    );
  return '';
}

function applyProviderStartupEnv(provider, env) {
  const nextEnv = { ...(env || {}) };
  const id = normalizeProviderId(provider);
  Object.assign(nextEnv, getProviderUpdateDisableEnv(id));
  const authMode = String(nextEnv.ZEELIN_AUTH_MODE || '')
    .trim()
    .toLowerCase();
  if (authMode === 'oauth') {
    nextEnv.GEMINI_API_KEY = '';
    nextEnv.GOOGLE_API_KEY = '';
    nextEnv.OPENAI_API_KEY = '';
    nextEnv.ANTHROPIC_API_KEY = '';
    nextEnv.ANTHROPIC_AUTH_TOKEN = '';
  }
  if (id === PROVIDERS.GEMINI && authMode === 'oauth') {
    // Embedded terminals frequently cannot complete browser consent auto-handoff.
    // Force manual URL + verification-code flow for stable OAuth behavior.
    nextEnv.NO_BROWSER = 'true';
    nextEnv.BROWSER = '';
  }
  if (
    id === PROVIDERS.CLAUDE &&
    /api\.deepseek\.com\/anthropic/i.test(String(nextEnv.ANTHROPIC_BASE_URL || ''))
  ) {
    // DeepSeek's Claude Code preset is auth-token based. Clear inherited
    // Anthropic API keys so host env does not override the active preset.
    nextEnv.ANTHROPIC_API_KEY = '';
  }
  return nextEnv;
}

module.exports = {
  PROVIDERS,
  normalizeProviderId,
  getLaunchCommandForProvider,
  getOAuthLoginCommandForProvider,
  getOAuthProbeCommandForProvider,
  getResumeCommandForProvider,
  isLocalGeneratedSessionId,
  applyProviderStartupEnv,
};
