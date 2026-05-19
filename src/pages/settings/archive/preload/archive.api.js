const { ipcRenderer } = require('electron');
const { ARCHIVE_CHANNELS } = require('../shared/archive.channels');

function createArchiveApi() {
  const archiveSession = (payload) => ipcRenderer.invoke(ARCHIVE_CHANNELS.SESSION_ARCHIVE, payload);
  const listArchived = (payload) => ipcRenderer.invoke(ARCHIVE_CHANNELS.SESSION_ARCHIVE_LIST, payload);
  const restore = (sessionId) => ipcRenderer.invoke(ARCHIVE_CHANNELS.SESSION_RESTORE, { sessionId });

  return {
    sessions: {
      archive: archiveSession,
      listArchived,
      restore,
    },
    archive: {
      archiveSession,
      listArchived,
      restore,
    },
  };
}

module.exports = { createArchiveApi };
