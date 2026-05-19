const { ipcRenderer } = require('electron');
const { FILE_TREE_CHANNELS } = require('../shared/file-tree.channels');

function createFileTreeApi() {
  const files = {
    readTree: (payload) => ipcRenderer.invoke(FILE_TREE_CHANNELS.READ, payload),
    openPath: (payload) => ipcRenderer.invoke(FILE_TREE_CHANNELS.OPEN_PATH, payload),
    saveAttachmentImage: (payload) =>
      ipcRenderer.invoke(FILE_TREE_CHANNELS.ATTACHMENT_SAVE, payload),
    saveAttachmentImageBuffer: (payload) =>
      ipcRenderer.invoke(FILE_TREE_CHANNELS.ATTACHMENT_SAVE_BUFFER, payload),
    open: (payload) => ipcRenderer.invoke(FILE_TREE_CHANNELS.OPEN_PATH, payload),
  };
  return {
    files,
    fileTree: files,
  };
}

module.exports = { createFileTreeApi };
