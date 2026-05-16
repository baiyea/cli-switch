const { ipcMain } = require("electron");
const { TERMINAL_CHANNELS } = require("../shared/terminal.channels");
const { PtyService } = require("./pty.service");

let ptyService = null;

function getPtyService() {
  if (!ptyService) {
    const log = require("electron-log");
    ptyService = new PtyService({
      onData({ sessionId, data }) {
        const win = require("electron").BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send(TERMINAL_CHANNELS.DATA, { sessionId, data });
        }
      },
      onExit({ sessionId, exitCode }) {
        const win = require("electron").BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send(TERMINAL_CHANNELS.EXIT, { sessionId, exitCode });
        }
      },
      logWarn(msg) { log.warn(msg); }
    });
  }
  return ptyService;
}

function registerTerminalIpc() {
  ipcMain.handle(TERMINAL_CHANNELS.START, (_event, { cwd, name }) => {
    const svc = getPtyService();
    return svc.create({ cwd, name });
  });

  ipcMain.handle(TERMINAL_CHANNELS.SNAPSHOT, (_event, { sessionId }) => {
    const svc = getPtyService();
    return svc.snapshot(sessionId);
  });

  ipcMain.on(TERMINAL_CHANNELS.WRITE, (_event, { sessionId, data }) => {
    const svc = getPtyService();
    svc.write(sessionId, data);
  });

  ipcMain.on(TERMINAL_CHANNELS.RESIZE, (_event, { sessionId, cols, rows }) => {
    const svc = getPtyService();
    svc.resize(sessionId, cols, rows);
  });

  ipcMain.on(TERMINAL_CHANNELS.KILL, (_event, { sessionId }) => {
    const svc = getPtyService();
    svc.destroy(sessionId);
  });
}

function destroyAllTerminals() {
  if (ptyService) {
    ptyService.destroyAll();
  }
}

module.exports = { registerTerminalIpc, destroyAllTerminals };
