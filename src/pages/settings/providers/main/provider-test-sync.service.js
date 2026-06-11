function createProviderTestSyncService({
  normalizeProviderId,
  getMergedProviderProfileEnvVars,
  applyProviderStartupEnv,
  applyUnifiedProxyEnv,
  buildEnvFromPairs,
  cliConfigSyncService,
  providerLiveSyncService,
}) {
  function syncCliConfigAfterSuccessfulProviderTest(parsed, source) {
    const provider = normalizeProviderId(parsed?.provider);
    const profileId = String(parsed?.profileId || '');
    const mergedPairs = getMergedProviderProfileEnvVars(provider, profileId, parsed?.envVars || []);
    const env = applyProviderStartupEnv(
      provider,
      applyUnifiedProxyEnv(buildEnvFromPairs(mergedPairs)),
    );
    const cliResult = cliConfigSyncService.syncProviderCliConfig({
      provider,
      profileId,
      env,
      source,
    });
    const liveResult =
      providerLiveSyncService?.syncProviderLiveConfig?.({
        provider,
        profile: {
          id: profileId,
          name: profileId,
          envVars: parsed?.envVars || [],
          settingsConfig: { env },
          meta: {},
        },
        env,
        source,
      }) || { ok: true, skipped: true };

    if (liveResult?.ok === false) return liveResult;
    return cliResult;
  }

  return {
    syncCliConfigAfterSuccessfulProviderTest,
  };
}

module.exports = {
  createProviderTestSyncService,
};
