function createIpcRouter({ ipcMain, logInfo = () => {}, logWarn = () => {}, logError = () => {} }) {
  function registerIpc(channel, handler) {
    if (typeof channel !== "string" || !channel.trim()) {
      logWarn("ipc", "Skip IPC registration because channel is invalid", { channel });
      return false;
    }
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await handler(event, payload);
      } catch (error) {
        logError("ipc", `Handler failed: ${channel}`, error, { payload });
        throw error;
      }
    });
    logInfo("ipc", "Registered invoke handler", { channel });
    return true;
  }

  return { registerIpc };
}

module.exports = { createIpcRouter };
