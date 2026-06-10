'use strict';

const { IM_CHANNELS } = require('./shared/im-channel.channels');
const { createImBindingRepository } = require('./main/im-binding.repository');
const { ImChannelManager, normalizeImConfig } = require('./main/im-channel.manager');
const { createFeishuInstallService } = require('./main/feishu-install.service');

function isE2eSimulationAllowed({ app, isPackaged } = {}) {
  const packaged =
    typeof isPackaged === 'boolean'
      ? isPackaged
      : typeof app?.isPackaged === 'boolean'
        ? app.isPackaged
        : true;
  return process.env.APP_E2E === '1' && packaged === false;
}

function assertAppSettingsStore(appSettingsStore) {
  if (!appSettingsStore || typeof appSettingsStore.getImChannelSettings !== 'function') {
    throw new TypeError('registerImChannelMain: appSettingsStore.getImChannelSettings is required');
  }
  if (typeof appSettingsStore.setImChannelSettings !== 'function') {
    throw new TypeError('registerImChannelMain: appSettingsStore.setImChannelSettings is required');
  }
}

function registerImChannelMain(context = {}) {
  const {
    registerIpc,
    appSettingsStore,
    db,
    imChannelSessionPort,
    logInfo = () => {},
    logWarn = () => {},
    logError = () => {},
    createManager,
    createInstallService,
  } = context;

  if (!registerIpc) return;
  if (!db) throw new TypeError('registerImChannelMain: db is required');
  assertAppSettingsStore(appSettingsStore);

  const bindingRepository = createImBindingRepository({
    db,
    now: () => new Date().toISOString(),
  });
  const managerFactory =
    typeof createManager === 'function'
      ? createManager
      : (managerContext) => new ImChannelManager(managerContext);
  const manager = managerFactory({
    bindingRepository,
    sessionPort: imChannelSessionPort,
    logInfo,
    logWarn,
    persistConfig: (config) => appSettingsStore.setImChannelSettings(config),
  });
  const installService =
    typeof createInstallService === 'function'
      ? createInstallService()
      : createFeishuInstallService();

  const readConfig = () => normalizeImConfig(appSettingsStore.getImChannelSettings());

  registerIpc(IM_CHANNELS.GET_CONFIG, async () => ({
    ok: true,
    config: readConfig(),
  }));

  registerIpc(IM_CHANNELS.SAVE_CONFIG, async (_event, payload) => {
    let config = normalizeImConfig(payload);
    try {
      config = appSettingsStore.setImChannelSettings(config);
      config = await manager.configure(config);
      return { ok: true, config, status: manager.getStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, config, status: manager.getStatus(), message };
    }
  });

  registerIpc(IM_CHANNELS.STATUS, async () => ({
    ok: true,
    status: manager.getStatus(),
  }));

  registerIpc(IM_CHANNELS.TEST_CONNECTION, async (_event, payload) => {
    const config = normalizeImConfig(payload || readConfig());
    if (!config.appId || !config.appSecret) {
      return { ok: false, message: 'missing-credentials', status: manager.getStatus() };
    }
    return { ok: true, message: 'ok', status: manager.getStatus() };
  });

  registerIpc(IM_CHANNELS.INSTALL_QRCODE, async (_event, payload) => {
    try {
      const config = normalizeImConfig(payload || readConfig());
      const result = await installService.startQrcode({ isLark: config.domain === 'lark' });
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  });

  registerIpc(IM_CHANNELS.INSTALL_POLL, async (_event, payload) => {
    const deviceCode = String(payload?.deviceCode || '').trim();
    if (!deviceCode) return { ok: false, done: false, message: 'missing-device-code' };

    try {
      const result = await installService.poll(deviceCode);
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, done: false, message };
    }
  });

  registerIpc(IM_CHANNELS.VERIFY_CREDENTIALS, async (_event, payload) => {
    const appId = String(payload?.appId || '').trim();
    const appSecret = String(payload?.appSecret || '').trim();
    if (!appId || !appSecret) return { ok: false, message: 'missing-credentials' };

    try {
      return await installService.verifyCredentials({ appId, appSecret });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  });

  if (isE2eSimulationAllowed(context)) {
    registerIpc('settings:im-channel:e2e:message', async (_event, payload) =>
      manager.simulatePrivateMessage(payload || {}),
    );
  }

  manager.configure(readConfig()).catch((error) => {
    logError('im-channel', 'Failed to configure IM channel manager', error);
  });
}

module.exports = { isE2eSimulationAllowed, registerImChannelMain };
