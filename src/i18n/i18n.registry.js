const DEFAULT_LOCALE = 'zh-CN';
const SUPPORTED_LOCALES = ['zh-CN', 'en-US'];

function normalizeLocale(value) {
  return SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

function interpolateMessage(message, params = {}) {
  let next = String(message ?? '');
  for (const [key, value] of Object.entries(params || {})) {
    next = next.replaceAll(`{${key}}`, String(value ?? ''));
  }
  return next;
}

function createMessageRegistry() {
  const messages = {
    'zh-CN': {},
    'en-US': {},
  };

  function registerMessages(_namespace, bundle = {}) {
    for (const locale of SUPPORTED_LOCALES) {
      messages[locale] = {
        ...messages[locale],
        ...(bundle[locale] || {}),
      };
    }
  }

  function t(locale, key, params) {
    const normalizedLocale = normalizeLocale(locale);
    const message = messages[normalizedLocale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
    return interpolateMessage(message, params);
  }

  function findMissingKeys(locale, baseLocale = DEFAULT_LOCALE) {
    const normalizedLocale = normalizeLocale(locale);
    const normalizedBaseLocale = normalizeLocale(baseLocale);
    const targetKeys = new Set(Object.keys(messages[normalizedLocale]));
    return Object.keys(messages[normalizedBaseLocale])
      .filter((key) => !targetKeys.has(key))
      .sort();
  }

  function clear() {
    for (const locale of SUPPORTED_LOCALES) {
      messages[locale] = {};
    }
  }

  return {
    clear,
    findMissingKeys,
    registerMessages,
    t,
  };
}

const messageRegistry = createMessageRegistry();

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createMessageRegistry,
  interpolateMessage,
  messageRegistry,
  normalizeLocale,
};
