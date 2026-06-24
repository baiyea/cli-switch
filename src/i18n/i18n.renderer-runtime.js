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

function normalizeNamespace(namespace) {
  return namespace || 'global';
}

function createMessageRegistry() {
  const messages = {
    'zh-CN': {},
    'en-US': {},
  };
  const owners = {};

  function registerMessages(namespace, bundle = {}) {
    const normalizedNamespace = normalizeNamespace(namespace);
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of Object.keys(bundle[locale] || {})) {
        const owner = owners[key];
        if (owner && owner !== normalizedNamespace) {
          throw new Error(
            `Duplicate i18n key "${key}" from namespace "${normalizedNamespace}"; already registered by "${owner}"`,
          );
        }
      }
    }

    for (const locale of SUPPORTED_LOCALES) {
      const localeMessages = bundle[locale] || {};
      for (const key of Object.keys(localeMessages)) {
        owners[key] = normalizedNamespace;
      }
      messages[locale] = {
        ...messages[locale],
        ...localeMessages,
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
    for (const key of Object.keys(owners)) {
      delete owners[key];
    }
  }

  return {
    clear,
    findMissingKeys,
    registerMessages,
    t,
  };
}

class I18nService {
  constructor(registry) {
    this.locale = DEFAULT_LOCALE;
    this.listeners = new Set();
    this.registry = registry;
  }

  getLocale() {
    return this.locale;
  }

  notify() {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(this.locale);
      } catch (error) {
        console.warn('[i18n] listener failed', error);
      }
    }
  }

  setLocale(locale) {
    const nextLocale = normalizeLocale(locale);
    if (this.locale === nextLocale) {
      return this.locale;
    }

    this.locale = nextLocale;
    this.notify();
    return this.locale;
  }

  registerMessages(namespace, bundle) {
    this.registry.registerMessages(namespace, bundle);
    this.notify();
  }

  t(key, params) {
    return this.registry.t(this.locale, key, params);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const messageRegistry = createMessageRegistry();
const i18nService = new I18nService(messageRegistry);

export {
  createMessageRegistry,
  DEFAULT_LOCALE,
  i18nService,
  interpolateMessage,
  normalizeLocale,
  SUPPORTED_LOCALES,
};
