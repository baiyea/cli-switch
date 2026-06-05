const { DEFAULT_LOCALE, messageRegistry, normalizeLocale } = require('./i18n.registry');

class I18nService {
  constructor(registry = messageRegistry) {
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

const i18nService = new I18nService();

module.exports = {
  I18nService,
  i18nService,
};
