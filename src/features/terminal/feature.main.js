const { ipcMain } = require("electron");
const { registerPtyHandlers } = require("./main/terminal.ipc");

function registerTerminalMain(ptyService) {
  registerPtyHandlers(ipcMain, ptyService);
}

module.exports = { registerTerminalMain };
