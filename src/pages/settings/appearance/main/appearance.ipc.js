const { APPEARANCE_CHANNELS } = require('../shared/appearance.channels');

function registerAppearanceIpc(context = {}) {
  const { registerIpc, appSettingsStore } = context;

  if (!registerIpc) return;

  const hasAppearanceSettingsStore =
    appSettingsStore &&
    typeof appSettingsStore.getAppearanceSettings === 'function' &&
    typeof appSettingsStore.setAppearanceSettings === 'function';

  if (!hasAppearanceSettingsStore) {
    const unavailable = {
      ok: false,
      reason: 'appearance settings unavailable',
      themeMode: 'system',
      locale: 'zh-CN',
    };
    registerIpc(APPEARANCE_CHANNELS.APPEARANCE_GET, async () => unavailable);
    registerIpc(APPEARANCE_CHANNELS.APPEARANCE_SET, async () => unavailable);
    return;
  }

  registerIpc(APPEARANCE_CHANNELS.APPEARANCE_GET, async () =>
    appSettingsStore.getAppearanceSettings(),
  );
  registerIpc(APPEARANCE_CHANNELS.APPEARANCE_SET, async (_event, payload) =>
    appSettingsStore.setAppearanceSettings(payload),
  );
}

module.exports = { registerAppearanceIpc };
