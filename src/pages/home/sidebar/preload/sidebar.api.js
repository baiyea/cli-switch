const { ipcRenderer } = require('electron');
const { SIDEBAR_CHANNELS } = require('../shared/sidebar.channels');

function createSidebarApi() {
  return {
    projects: {
      list: () => ipcRenderer.invoke(SIDEBAR_CHANNELS.PROJECT_LIST),
      add: () => ipcRenderer.invoke(SIDEBAR_CHANNELS.PROJECT_ADD),
      remove: (id) => ipcRenderer.invoke(SIDEBAR_CHANNELS.PROJECT_REMOVE, { id }),
    },
    sessions: {
      list: (payload) => ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_LIST, payload),
      create: (payload) => ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_CREATE, payload),
      start: (payload) => ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_START, payload),
      rename: (payload) => ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_RENAME, payload),
      suggestTitle: (payload) =>
        ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_SUGGEST_TITLE, payload),
      syncProject: (payload) => ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_SYNC_PROJECT, payload),
      reorder: (payload) => ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_REORDER, payload),
      stats: (payload) => ipcRenderer.invoke(SIDEBAR_CHANNELS.SESSION_STATS, payload),
    },
  };
}

module.exports = { createSidebarApi };
