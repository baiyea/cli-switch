const { ipcRenderer } = require("electron");
const { IPC } = require("../../../shared/types.js");

function createSidebarApi() {
  return {
    projects: {
      list: () => ipcRenderer.invoke(IPC.PROJECT_LIST),
      add: () => ipcRenderer.invoke(IPC.PROJECT_ADD),
      remove: (id) => ipcRenderer.invoke(IPC.PROJECT_REMOVE, { id }),
    },
    sessions: {
      list: (payload) => ipcRenderer.invoke(IPC.SESSION_LIST, payload),
      create: (payload) => ipcRenderer.invoke(IPC.SESSION_CREATE, payload),
      start: (payload) => ipcRenderer.invoke(IPC.SESSION_START, payload),
      rename: (payload) => ipcRenderer.invoke(IPC.SESSION_RENAME, payload),
      suggestTitle: (payload) => ipcRenderer.invoke(IPC.SESSION_SUGGEST_TITLE, payload),
      syncProject: (payload) => ipcRenderer.invoke(IPC.SESSION_SYNC_PROJECT, payload),
      reorder: (payload) => ipcRenderer.invoke(IPC.SESSION_REORDER, payload),
      stats: (payload) => ipcRenderer.invoke(IPC.SESSION_STATS, payload),
    },
  };
}

module.exports = { createSidebarApi };
