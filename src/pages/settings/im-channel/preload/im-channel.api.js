'use strict';

const { ipcRenderer } = require('electron');
const { IM_CHANNELS } = require('../shared/im-channel.channels');

function isE2eSimulationAllowed({ isPackaged = true } = {}) {
  return process.env.APP_E2E === '1' && isPackaged === false;
}

function createImChannelApi(options = {}) {
  const api = {
    imChannel: {
      getConfig: () => ipcRenderer.invoke(IM_CHANNELS.GET_CONFIG),
      saveConfig: (payload) => ipcRenderer.invoke(IM_CHANNELS.SAVE_CONFIG, payload),
      status: () => ipcRenderer.invoke(IM_CHANNELS.STATUS),
      testConnection: () => ipcRenderer.invoke(IM_CHANNELS.TEST_CONNECTION),
      installQrcode: (payload) => ipcRenderer.invoke(IM_CHANNELS.INSTALL_QRCODE, payload),
      installPoll: (payload) => ipcRenderer.invoke(IM_CHANNELS.INSTALL_POLL, payload),
      verifyCredentials: (payload) => ipcRenderer.invoke(IM_CHANNELS.VERIFY_CREDENTIALS, payload),
    },
  };

  if (isE2eSimulationAllowed(options)) {
    api.imChannel.simulatePrivateMessage = (payload) =>
      ipcRenderer.invoke('settings:im-channel:e2e:message', payload);
  }

  return api;
}

module.exports = { createImChannelApi, isE2eSimulationAllowed };
