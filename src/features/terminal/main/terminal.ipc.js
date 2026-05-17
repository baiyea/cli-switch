const { IPC } = require("../../../shared/types.js");

function maskPtyInputForLog(data) {
  const normalized = String(data || "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
  if (!normalized) return { length: 0, masked: "" };
  if (normalized.length <= 12) {
    return {
      length: normalized.length,
      masked: `${normalized.slice(0, 2)}***${normalized.slice(-2)}`
    };
  }
  return {
    length: normalized.length,
    masked: `${normalized.slice(0, 8)}***${normalized.slice(-6)}`
  };
}

function shouldLogPtyInput(meta) {
  const provider = String(meta?.provider || "").toLowerCase();
  const name = String(meta?.name || "");
  return provider === "gemini" && /oauth login/i.test(name);
}

function registerPtyHandlers(ipcMain, ptyService, logger = {}) {
  const logInfo = typeof logger.logInfo === "function" ? logger.logInfo : () => {};

  ipcMain.handle(IPC.PTY_CREATE, async (_event, payload) => {
    return ptyService.create(payload);
  });

  ipcMain.handle(IPC.PTY_SNAPSHOT, async (_event, payload) => {
    return ptyService.getSnapshot(payload.sessionId);
  });

  ipcMain.on(IPC.PTY_INPUT, (_event, payload) => {
    const meta = ptyService.getSessionMeta?.(payload.sessionId);
    const wrote = ptyService.write(payload.sessionId, payload.data);
    if (shouldLogPtyInput(meta)) {
      logInfo("oauth-login", "Submitted OAuth code to PTY", {
        provider: meta.provider,
        sessionId: payload.sessionId,
        sessionName: meta.name,
        wrote,
        input: maskPtyInputForLog(payload.data)
      });
    }
  });

  ipcMain.on(IPC.PTY_RESIZE, (_event, payload) => {
    ptyService.resize(payload.sessionId, payload.cols, payload.rows);
  });

  ipcMain.on(IPC.PTY_DESTROY, (_event, payload) => {
    ptyService.destroy(payload.sessionId);
  });
}

module.exports = { registerPtyHandlers };
