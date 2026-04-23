const { contextBridge, ipcRenderer } = require("electron");
const { IPC } = require("../shared/types.js");

contextBridge.exposeInMainWorld("electronAPI", {
  pty: {
    create: (payload) => ipcRenderer.invoke(IPC.PTY_CREATE, payload),
    input: (payload) => ipcRenderer.send(IPC.PTY_INPUT, payload),
    resize: (payload) => ipcRenderer.send(IPC.PTY_RESIZE, payload),
    destroy: (payload) => ipcRenderer.send(IPC.PTY_DESTROY, payload),
    onData: (listener) => {
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on(IPC.PTY_DATA, wrapped);
      return () => ipcRenderer.removeListener(IPC.PTY_DATA, wrapped);
    },
    onExit: (listener) => {
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on(IPC.PTY_EXIT, wrapped);
      return () => ipcRenderer.removeListener(IPC.PTY_EXIT, wrapped);
    }
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.PROJECT_LIST),
    add: () => ipcRenderer.invoke(IPC.PROJECT_ADD),
    remove: (id) => ipcRenderer.invoke(IPC.PROJECT_REMOVE, { id })
  },
  sessions: {
    list: (payload) => ipcRenderer.invoke(IPC.SESSION_LIST, payload),
    create: (payload) => ipcRenderer.invoke(IPC.SESSION_CREATE, payload),
    start: (payload) => ipcRenderer.invoke(IPC.SESSION_START, payload),
    syncProject: (payload) => ipcRenderer.invoke(IPC.SESSION_SYNC_PROJECT, payload),
    archive: (payload) => ipcRenderer.invoke(IPC.SESSION_ARCHIVE, payload),
    listArchived: (payload) => ipcRenderer.invoke(IPC.SESSION_ARCHIVE_LIST, payload),
    restore: (sessionId) => ipcRenderer.invoke(IPC.SESSION_RESTORE, { sessionId })
  },
  settings: {
    getClaude: () => ipcRenderer.invoke(IPC.SETTINGS_CLAUDE_GET),
    saveClaude: (payload) => ipcRenderer.invoke(IPC.SETTINGS_CLAUDE_SAVE, payload)
  },
  skillgen: {
    run: (payload) => ipcRenderer.invoke(IPC.SKILLGEN_RUN, payload)
  },
  logs: {
    write: (payload) => ipcRenderer.send(IPC.APP_LOG, payload)
  },
  files: {
    readTree: (payload) => ipcRenderer.invoke(IPC.FILE_TREE_READ, payload),
    openPath: (payload) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, payload),
    // Backward compatibility with older renderer bridge naming.
    open: (payload) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, payload)
  }
});
