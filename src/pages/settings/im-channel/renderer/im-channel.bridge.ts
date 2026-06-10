type ImChannelApi = NonNullable<Window['electronAPI']['imChannel']>;

export const imChannelBridge: ImChannelApi = {
  getConfig: () => window.electronAPI.imChannel.getConfig(),
  saveConfig: (payload) => window.electronAPI.imChannel.saveConfig(payload),
  status: () => window.electronAPI.imChannel.status(),
  testConnection: () => window.electronAPI.imChannel.testConnection(),
  installQrcode: (payload) => window.electronAPI.imChannel.installQrcode(payload),
  installPoll: (payload) => window.electronAPI.imChannel.installPoll(payload),
  verifyCredentials: (payload) => window.electronAPI.imChannel.verifyCredentials(payload),
};
