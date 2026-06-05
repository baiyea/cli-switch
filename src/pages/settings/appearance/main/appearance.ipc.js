const { APPEARANCE_CHANNELS } = require('../shared/appearance.channels');
const { setMainLocale, t } = require('../../../../i18n/main');

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
      reason: t('main.settings.appearanceUnavailable'),
      themeMode: 'system',
      locale: 'zh-CN',
    };
    registerIpc(APPEARANCE_CHANNELS.APPEARANCE_GET, async () => unavailable);
    registerIpc(APPEARANCE_CHANNELS.APPEARANCE_SET, async () => unavailable);
    return;
  }

  registerIpc(APPEARANCE_CHANNELS.APPEARANCE_GET, async () => {
    const settings = appSettingsStore.getAppearanceSettings();
    setMainLocale(settings?.locale);
    return settings;
  });
  registerIpc(APPEARANCE_CHANNELS.APPEARANCE_SET, async (_event, payload) => {
    const settings = appSettingsStore.setAppearanceSettings(payload);
    setMainLocale(settings?.locale);
    return settings;
  });
}

module.exports = { registerAppearanceIpc };
