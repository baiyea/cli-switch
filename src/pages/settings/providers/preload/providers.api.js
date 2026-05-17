const { ipcRenderer } = require("electron");
const { PROVIDERS_CHANNELS } = require("../shared/providers.channels");

function createProvidersApi() {
  return {
    settings: {
      getClaude: () => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_CLAUDE_GET),
      saveClaude: (payload) => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_CLAUDE_SAVE, payload),
      testProvider: (payload) => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_TEST, payload),
      startProviderOAuthLogin: (payload) => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_OAUTH_LOGIN, payload),
      probeProviderOAuth: (payload) => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_OAUTH_PROBE, payload),
      getProviderOAuthLinks: (payload) => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_OAUTH_LINKS, payload),
      testProviderProxy: (payload) => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_PROVIDER_PROXY_TEST, payload),
      cleanRuntimeData: () => ipcRenderer.invoke(PROVIDERS_CHANNELS.SETTINGS_RUNTIME_CLEAN),
    },
  };
}

module.exports = { createProvidersApi };
