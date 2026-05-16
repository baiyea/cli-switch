const { contextBridge } = require("electron");
const { createTerminalPreloadApi } = require("../features/terminal/feature.preload");

contextBridge.exposeInMainWorld("api", {
  ...createTerminalPreloadApi(),
});
