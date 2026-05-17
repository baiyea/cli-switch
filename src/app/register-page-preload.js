const { ipcRenderer } = require("electron");
const { IPC } = require("../shared/types.js");
const { createTerminalPreloadApi } = require("../pages/home/terminal/block.preload");
const { createSidebarPreloadApi } = require("../pages/home/sidebar/block.preload");
const { createFileTreePreloadApi } = require("../pages/home/file-tree/block.preload");
const { createTopToolbarPreloadApi } = require("../pages/home/top-toolbar/block.preload");
const { createProvidersPreloadApi } = require("../pages/settings/providers/block.preload");
const { createArchivePreloadApi } = require("../pages/settings/archive/block.preload");

function mergeApis(...parts) {
  const target = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part || {})) {
      if (
        value && typeof value === "object" && !Array.isArray(value)
        && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])
      ) {
        target[key] = { ...target[key], ...value };
        continue;
      }
      target[key] = value;
    }
  }
  return target;
}

function createWindowControlsApi() {
  return {
    windowControls: {
      setTrafficLightPosition: (payload) => ipcRenderer.invoke(IPC.WINDOW_SET_TRAFFIC_LIGHT, payload),
      openExternal: (payload) => ipcRenderer.invoke(IPC.WINDOW_OPEN_EXTERNAL, payload),
      minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
      toggleMaximize: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
      close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE)
    },
    skillgen: {
      run: (payload) => ipcRenderer.invoke(IPC.SKILLGEN_RUN, payload)
    },
    logs: {
      write: (payload) => ipcRenderer.send(IPC.APP_LOG, payload)
    }
  };
}

function createPageApis() {
  return mergeApis(
    createTerminalPreloadApi(),
    createSidebarPreloadApi(),
    createFileTreePreloadApi(),
    createTopToolbarPreloadApi(),
    createProvidersPreloadApi(),
    createArchivePreloadApi(),
    createWindowControlsApi()
  );
}

module.exports = { createPageApis };
