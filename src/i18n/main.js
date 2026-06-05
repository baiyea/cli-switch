const { DEFAULT_LOCALE, SUPPORTED_LOCALES } = require('./i18n.registry');

const messages = {
  'zh-CN': {
    'main.settings.appearanceUnavailable': '外观设置不可用',
    'main.provider.connectionTestError': '连接测试异常: {message}',
    'main.provider.oauthLoginError': 'OAuth 登录启动异常: {message}',
    'main.provider.oauthProbeError': 'OAuth 探测异常: {message}',
    'main.provider.proxyTestError': '代理测试异常: {message}',
    'main.provider.runtimeCleanError': '运行数据清理失败: {message}',
  },
  'en-US': {
    'main.settings.appearanceUnavailable': 'Appearance settings are unavailable',
    'main.provider.connectionTestError': 'Connection test failed: {message}',
    'main.provider.oauthLoginError': 'OAuth login failed: {message}',
    'main.provider.oauthProbeError': 'OAuth probe failed: {message}',
    'main.provider.proxyTestError': 'Proxy test failed: {message}',
    'main.provider.runtimeCleanError': 'Runtime data cleanup failed: {message}',
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
