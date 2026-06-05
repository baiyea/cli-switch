const DEFAULT_LOCALE = 'zh-CN';
const SUPPORTED_LOCALES = ['zh-CN', 'en-US'];

const messages = {
  'zh-CN': {
    'main.settings.appearanceUnavailable': '外观设置不可用',
  },
  'en-US': {
    'main.settings.appearanceUnavailable': 'Appearance settings are unavailable',
  },
};

let mainLocale = DEFAULT_LOCALE;

function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

function setMainLocale(locale) {
  mainLocale = normalizeLocale(locale);
  return mainLocale;
}

function getMainLocale() {
  return mainLocale;
}

function interpolateMessage(message, params = {}) {
  let next = String(message ?? '');
  for (const [key, value] of Object.entries(params || {})) {
    next = next.replaceAll(`{${key}}`, String(value ?? ''));
  }
  return next;
}

function t(key, params = {}) {
  const message = messages[mainLocale]?.[key] ?? messages[DEFAULT_LOCALE]?.[key] ?? key;
  return interpolateMessage(message, params);
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getMainLocale,
  normalizeLocale,
  setMainLocale,
  t,
};
