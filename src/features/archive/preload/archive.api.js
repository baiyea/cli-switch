const { ipcRenderer } = require("electron");
const { IPC } = require("../../../shared/types.js");

function createArchiveApi() {
  return {
    archive: {
      archiveSession: (payload) => ipcRenderer.invoke(IPC.SESSION_ARCHIVE, payload),
      listArchived: (payload) => ipcRenderer.invoke(IPC.SESSION_ARCHIVE_LIST, payload),
      restore: (sessionId) => ipcRenderer.invoke(IPC.SESSION_RESTORE, { sessionId }),
    },
  };
}

module.exports = { createArchiveApi };
