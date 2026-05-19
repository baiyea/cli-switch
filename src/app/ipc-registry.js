function registerAppIpc(context = {}) {
  const {
    ipcMain,
    registerPageMain,
    logInfo,
    logWarn,
    logError,
  } = context;

  const registerIpc = (channel, handler) => {
    if (typeof channel !== 'string' || !channel.trim()) {
      logWarn('ipc', 'Skip IPC registration because channel is invalid', { channel });
      return false;
    }
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await handler(event, payload);
      } catch (error) {
        logError('ipc', `Handler failed: ${channel}`, error, { payload });
        throw error;
      }
    });
    logInfo('ipc', 'Registered invoke handler', { channel });
    return true;
  };

  const registerIpcOn = (channel, handler) => {
    if (typeof channel !== 'string' || !channel.trim()) {
      logWarn('ipc', 'Skip IPC on-registration because channel is invalid', { channel });
      return false;
    }
    ipcMain.on(channel, (event, payload) => {
      try {
        handler(event, payload);
      } catch (error) {
        logError('ipc', `On-handler failed: ${channel}`, error, { payload });
      }
    });
    logInfo('ipc', 'Registered event handler', { channel });
    return true;
  };

  registerPageMain({
    ...context,
    registerIpc,
    registerIpcOn,
  });
}

module.exports = {
  registerAppIpc,
};
