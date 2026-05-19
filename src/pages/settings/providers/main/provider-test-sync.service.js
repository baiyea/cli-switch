function createProviderTestSyncService({
  normalizeProviderId,
  getMergedProviderProfileEnvVars,
  applyProviderStartupEnv,
  applyUnifiedProxyEnv,
  buildEnvFromPairs,
  cliConfigSyncService,
}) {
  function syncCliConfigAfterSuccessfulProviderTest(parsed, source) {
    const provider = normalizeProviderId(parsed?.provider);
    const profileId = String(parsed?.profileId || '');
    const mergedPairs = getMergedProviderProfileEnvVars(provider, profileId, parsed?.envVars || []);
    const env = applyProviderStartupEnv(
      provider,
      applyUnifiedProxyEnv(buildEnvFromPairs(mergedPairs)),
    );
    return cliConfigSyncService.syncProviderCliConfig({
      provider,
      profileId,
      env,
      source,
    });
  }

  return {
    syncCliConfigAfterSuccessfulProviderTest,
  };
}

module.exports = {
  createProviderTestSyncService,
};
