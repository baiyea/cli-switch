const fs = require('node:fs');

const { createLiveSyncPaths } = require('./live-sync-paths');

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (value === 'claude' || value === 'codex' || value === 'gemini') return value;
  return '';
}

function getAdapter(adapter) {
  if (adapter && typeof adapter.sync === 'function') return adapter;
  return null;
}

function normalizeAdapterResult(result) {
  if (result === undefined || result === null) {
    return { ok: true };
  }
  if (typeof result === 'object' && !Array.isArray(result)) {
    return result;
  }
  return { ok: true, value: result };
}

function createProviderLiveSyncService({
  homedir,
  logInfo = () => {},
  logWarn = () => {},
  adapters = {},
  claudeAdapter,
  codexAdapter,
  geminiAdapter,
} = {}) {
  const paths = createLiveSyncPaths({ homedir });
  const providerDefinitions = {
    claude: {
      dirPath: paths.claudeDir(),
      adapter: getAdapter(adapters.claude || claudeAdapter),
    },
    codex: {
      dirPath: paths.codexDir(),
      adapter: getAdapter(adapters.codex || codexAdapter),
    },
    gemini: {
      dirPath: paths.geminiDir(),
      adapter: getAdapter(adapters.gemini || geminiAdapter),
    },
  };
  const providerIds = Object.keys(providerDefinitions);

  async function syncProviderLiveConfig({ provider, profile, env = {}, source = '' } = {}) {
    const providerId = normalizeProvider(provider);
    if (!providerId) {
      return { ok: true, skipped: true, reason: 'unsupported-provider' };
    }

    const target = providerDefinitions[providerId] || null;
    if (!target) {
      return { ok: true, skipped: true, reason: 'unsupported-provider' };
    }

    if (!fs.existsSync(target.dirPath)) {
      logInfo(
        'provider-live-sync',
        'Skipped provider live sync because CLI config is not initialized',
        {
          provider: providerId,
          configDir: target.dirPath,
        },
      );
      return { ok: true, skipped: true, reason: 'live-config-not-initialized' };
    }

    if (!target.adapter) {
      return { ok: true, skipped: true, reason: 'adapter-not-configured' };
    }

    try {
      const result = await Promise.resolve(
        target.adapter.sync({
          profile,
          env,
          paths,
          source,
        }),
      );
      return normalizeAdapterResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('provider-live-sync', 'Failed to sync provider live config', {
        provider: providerId,
        source,
        reason: message,
      });
      return { ok: false, error, message };
    }
  }

  return {
    syncProviderLiveConfig,
    syncProviderLiveSync: syncProviderLiveConfig,
    providerIds,
  };
}

module.exports = {
  createProviderLiveSyncService,
};
