const { ipcRenderer } = require("electron");
const { IPC } = require("../../../shared/types.js");

function createProvidersApi() {
  return {
    settings: {
      getClaude: () => ipcRenderer.invoke(IPC.SETTINGS_CLAUDE_GET),
      saveClaude: (payload) => ipcRenderer.invoke(IPC.SETTINGS_CLAUDE_SAVE, payload),
      testProvider: (payload) => ipcRenderer.invoke(IPC.SETTINGS_PROVIDER_TEST, payload),
      startProviderOAuthLogin: (payload) => ipcRenderer.invoke(IPC.SETTINGS_PROVIDER_OAUTH_LOGIN, payload),
      probeProviderOAuth: (payload) => ipcRenderer.invoke(IPC.SETTINGS_PROVIDER_OAUTH_PROBE, payload),
      getProviderOAuthLinks: (payload) => ipcRenderer.invoke(IPC.SETTINGS_PROVIDER_OAUTH_LINKS, payload),
      testProviderProxy: (payload) => ipcRenderer.invoke(IPC.SETTINGS_PROVIDER_PROXY_TEST, payload),
      cleanRuntimeData: () => ipcRenderer.invoke(IPC.SETTINGS_RUNTIME_CLEAN),
    },
  };
}

module.exports = { createProvidersApi };
