const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  projects: {
    list: () => ipcRenderer.invoke("project:list"),
    add: () => ipcRenderer.invoke("project:add"),
    remove: (id) => ipcRenderer.invoke("project:remove", { id })
  },
  sessions: {
    list: (projectId) => ipcRenderer.invoke("session:list", { projectId }),
    listArchived: (projectId) => ipcRenderer.invoke("session:listArchived", { projectId }),
    create: (payload) => ipcRenderer.invoke("session:create", payload),
    start: (sessionId) => ipcRenderer.invoke("session:start", { sessionId }),
    resume: (sessionId) => ipcRenderer.invoke("session:resume", { sessionId }),
    stop: (sessionId) => ipcRenderer.invoke("session:stop", { sessionId }),
    buffer: (sessionId) => ipcRenderer.invoke("session:buffer", { sessionId }),
    rename: (sessionId, title) => ipcRenderer.invoke("session:rename", { sessionId, title }),
    archive: (sessionId) => ipcRenderer.invoke("session:archive", { sessionId }),
    restore: (sessionId) => ipcRenderer.invoke("session:restore", { sessionId })
  },
  terminal: {
    input: (sessionId, text) => ipcRenderer.invoke("terminal:input", { sessionId, text }),
    onOutput: (listener) => {
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on("terminal:output", wrapped);
      return () => ipcRenderer.removeListener("terminal:output", wrapped);
    },
    onExit: (listener) => {
      const wrapped = (_event, payload) => listener(payload);
      ipcRenderer.on("terminal:exit", wrapped);
      return () => ipcRenderer.removeListener("terminal:exit", wrapped);
    }
  },
  providers: {
    list: () => ipcRenderer.invoke("provider:list")
  },
  settings: {
    getClaude: () => ipcRenderer.invoke("settings:claude:get"),
    saveClaude: (payload) => ipcRenderer.invoke("settings:claude:save", payload)
  }
});
