const { ipcRenderer } = require('electron');
const { TOKEN_USAGE_CHANNELS } = require('../shared/token-usage.channels');

function createTokenUsageApi() {
  return {
    tokenUsage: {
      summary: (payload) => ipcRenderer.invoke(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_SUMMARY, payload),
      refresh: (payload) => ipcRenderer.invoke(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH, payload),
      status: () => ipcRenderer.invoke(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH_STATUS),
    },
  };
}

module.exports = { createTokenUsageApi };
