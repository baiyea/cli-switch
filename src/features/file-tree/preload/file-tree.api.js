const { ipcRenderer } = require("electron");
const { IPC } = require("../../../shared/types.js");

function createFileTreeApi() {
  return {
    fileTree: {
      readTree: (payload) => ipcRenderer.invoke(IPC.FILE_TREE_READ, payload),
      openPath: (payload) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, payload),
      saveAttachmentImage: (payload) => ipcRenderer.invoke(IPC.FILE_ATTACHMENT_SAVE, payload),
      saveAttachmentImageBuffer: (payload) => ipcRenderer.invoke(IPC.FILE_ATTACHMENT_SAVE_BUFFER, payload),
      open: (payload) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, payload),
    },
  };
}

module.exports = { createFileTreeApi };
