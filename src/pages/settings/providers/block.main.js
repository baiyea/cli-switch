const { PROVIDERS_CHANNELS } = require('./shared/providers.channels');
const { t } = require('../../../i18n/main');

function registerProvidersMain(context = {}) {
  const {
    registerIpc,
    appSettingsStore,
    providerSettingsSchema,
    stripPresetValuesFromProviderSettings,
    providerTestSchema,
    providerConnectionService,
    syncCliConfigAfterSuccessfulProviderTest,
    providerOAuthLoginSchema,
    startProviderOAuthLogin,
    providerOAuthProbeSchema,
    oauthProbeService,
    providerOAuthLinksSchema,
    oauthLoginTracker,
    providerProxyTestSchema,
    proxyConnectivityService,
    cleanRuntimeData,
    dbPath,
    logInfo = () => {},
    logWarn = () => {},
    logError = () => {},
  } = context;

  if (!registerIpc) return;

  registerIpc(PROVIDERS_CHANNELS.SETTINGS_CLAUDE_GET, async () =>
    appSettingsStore.getProviderStartupSettings(),
  );
  registerIpc(PROVIDERS_CHANNELS.SETTINGS_CLAUDE_SAVE, async (_event, payload) => {
    const parsed = providerSettingsSchema.parse(payload);
    const sanitized = stripPresetValuesFromProviderSettings(parsed);
    return appSettingsStore.setProviderStartupSettings(sanitized);
  });
  registerIpc(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_TEST, async (_event, payload) => {
    const parsed = providerTestSchema.parse(payload);
    try {
      const result = await providerConnectionService.testProviderConnection(parsed);
      if (result?.ok) syncCliConfigAfterSuccessfulProviderTest(parsed, 'provider-test');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('provider-test', 'Unhandled provider connection test error', error, {
        provider: parsed?.provider || '',
      });
      return { ok: false, message: t('main.provider.connectionTestError', { message }) };
    }
  });
  registerIpc(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_OAUTH_LOGIN, async (_event, payload) => {
    const parsed = providerOAuthLoginSchema.parse(payload);
    try {
      return await startProviderOAuthLogin(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('oauth-login', 'Unhandled OAuth login start error', error, {
        provider: parsed?.provider || '',
        profileId: parsed?.profileId || '',
      });
      return { ok: false, message: t('main.provider.oauthLoginError', { message }) };
    }
  });
  registerIpc(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_OAUTH_PROBE, async (_event, payload) => {
    const parsed = providerOAuthProbeSchema.parse(payload);
    try {
      const result = await oauthProbeService.probeProviderOAuthConnection(parsed);
      if (result?.ok) syncCliConfigAfterSuccessfulProviderTest(parsed, 'oauth-probe');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('oauth-probe', 'Unhandled OAuth real probe error', error, {
        provider: parsed?.provider || '',
        profileId: parsed?.profileId || '',
      });
      return { ok: false, message: t('main.provider.oauthProbeError', { message }) };
    }
  });
  registerIpc(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_OAUTH_LINKS, async (_event, payload) => {
    const parsed = providerOAuthLinksSchema.parse(payload || {});
    try {
      return oauthLoginTracker.getProviderOAuthLinks(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('oauth-login', 'Unhandled OAuth link query error', error, {
        provider: parsed?.provider || '',
        profileId: parsed?.profileId || '',
        sessionId: parsed?.sessionId || '',
      });
      return { ok: false, allUrls: [], authUrls: [], autoOpenedUrl: '', message };
    }
  });
  registerIpc(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_PROXY_TEST, async (_event, payload) => {
    const parsed = providerProxyTestSchema.parse(payload);
    try {
      return await proxyConnectivityService.testProviderProxyConnectivity(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('proxy-test', 'Unhandled proxy connectivity test error', error, {
        provider: parsed?.provider || '',
        profileId: parsed?.profileId || '',
      });
      return { ok: false, message: t('main.provider.proxyTestError', { message }) };
    }
  });

  const runtimeCleanHandler = async () => {
    try {
      const result = cleanRuntimeData();
      logInfo('settings', 'Runtime data cleaned', {
        runtimeDirs: result.runtimeDirs,
        dbPath: result.dbPath,
        cleanedDirectories: result.cleanedDirectories.length,
        cleanedFiles: result.cleanedFiles.length,
        warnings: result.warnings.length,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('settings', 'Runtime data cleanup failed', error);
      return {
        ok: false,
        message: t('main.provider.runtimeCleanError', { message }),
        runtimeDirs: [],
        dbPath,
        cleanedDirectories: [],
        cleanedFiles: [],
        warnings: [],
      };
    }
  };
  registerIpc(
    PROVIDERS_CHANNELS.SETTINGS_RUNTIME_CLEAN || 'settings:runtime:clean',
    runtimeCleanHandler,
  );
  if (PROVIDERS_CHANNELS.SETTINGS_RUNTIME_CLEAN !== 'settings:runtime:clean') {
    try {
      registerIpc('settings:runtime:clean', runtimeCleanHandler);
    } catch (error) {
      logWarn('ipc', 'Skip duplicate runtime clean IPC registration', {
        channel: 'settings:runtime:clean',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

module.exports = { registerProvidersMain };
