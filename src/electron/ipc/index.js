const { registerPtyHandlers } = require("./pty.handler");

function registerAllIpc(ipcMain, services) {
  registerPtyHandlers(ipcMain, services.ptyService, services.logger);
}

module.exports = { registerAllIpc };
