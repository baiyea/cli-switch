const {
  applyProviderStartupEnv,
  getLaunchCommandForProvider,
  getOAuthLoginCommandForProvider,
  getOAuthProbeCommandForProvider,
  getResumeCommandForProvider,
  isLocalGeneratedSessionId,
  normalizeProviderId,
} = require('./providers/main/cli-launchers');
const { listProviderSessions, mapSessionsToProjects } = require('./providers/main/session-sources');
const { createOAuthLoginTracker } = require('./providers/main/oauth-login-tracker');
const { createProviderSettingsRuntime } = require('./providers/main/provider-settings-runtime');
const { createProviderConnectionService } = require('./providers/main/provider-connection-service');
const { createOAuthProbeService } = require('./providers/main/oauth-probe-service');
const { createProxyConnectivityService } = require('./providers/main/proxy-connectivity-service');
const { createCliConfigSyncService } = require('./providers/main/cli-config-sync-service');

module.exports = {
  applyProviderStartupEnv,
  getLaunchCommandForProvider,
  getOAuthLoginCommandForProvider,
  getOAuthProbeCommandForProvider,
  getResumeCommandForProvider,
  isLocalGeneratedSessionId,
  normalizeProviderId,
  listProviderSessions,
  mapSessionsToProjects,
  createOAuthLoginTracker,
  createProviderSettingsRuntime,
  createProviderConnectionService,
  createOAuthProbeService,
  createProxyConnectivityService,
  createCliConfigSyncService,
};
