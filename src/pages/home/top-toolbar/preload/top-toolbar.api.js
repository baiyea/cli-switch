const { ipcRenderer } = require('electron');
const { TOP_TOOLBAR_CHANNELS } = require('../shared/top-toolbar.channels');

function createTopToolbarApi() {
  return {
    windowControls: {
      setTrafficLightPosition: (payload) =>
        ipcRenderer.invoke(TOP_TOOLBAR_CHANNELS.WINDOW_SET_TRAFFIC_LIGHT, payload),
      openExternal: (payload) =>
        ipcRenderer.invoke(TOP_TOOLBAR_CHANNELS.WINDOW_OPEN_EXTERNAL, payload),
      minimize: () => ipcRenderer.invoke(TOP_TOOLBAR_CHANNELS.WINDOW_MINIMIZE),
      toggleMaximize: () => ipcRenderer.invoke(TOP_TOOLBAR_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
      close: () => ipcRenderer.invoke(TOP_TOOLBAR_CHANNELS.WINDOW_CLOSE),
    },
    skillgen: {
      run: (payload) => ipcRenderer.invoke(TOP_TOOLBAR_CHANNELS.SKILLGEN_RUN, payload),
    },
    logs: {
      write: (payload) => ipcRenderer.send(TOP_TOOLBAR_CHANNELS.APP_LOG, payload),
    },
  };
}

module.exports = { createTopToolbarApi };
