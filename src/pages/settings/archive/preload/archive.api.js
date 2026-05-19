const { ipcRenderer } = require('electron');
const { ARCHIVE_CHANNELS } = require('../shared/archive.channels');

function createArchiveApi() {
  return {
    archive: {
      archiveSession: (payload) => ipcRenderer.invoke(ARCHIVE_CHANNELS.SESSION_ARCHIVE, payload),
      listArchived: (payload) => ipcRenderer.invoke(ARCHIVE_CHANNELS.SESSION_ARCHIVE_LIST, payload),
      restore: (sessionId) => ipcRenderer.invoke(ARCHIVE_CHANNELS.SESSION_RESTORE, { sessionId }),
    },
  };
}

module.exports = { createArchiveApi };
