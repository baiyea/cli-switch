const { ipcRenderer } = require('electron');
const { APPEARANCE_CHANNELS } = require('../shared/appearance.channels');

function createAppearanceApi() {
  return {
    appearance: {
      get: () => ipcRenderer.invoke(APPEARANCE_CHANNELS.APPEARANCE_GET),
      set: (payload) => ipcRenderer.invoke(APPEARANCE_CHANNELS.APPEARANCE_SET, payload),
    },
  };
}

module.exports = { createAppearanceApi };
