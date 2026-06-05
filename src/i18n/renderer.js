import registryModule from './i18n.registry.js';
import serviceModule from './i18n.service.js';
import enUSMessages from './locales/en-US.json';
import zhCNMessages from './locales/zh-CN.json';

const { normalizeLocale } = registryModule;
const { i18nService } = serviceModule;

function registerGlobalI18n() {
  i18nService.registerMessages('global', {
    'zh-CN': zhCNMessages,
    'en-US': enUSMessages,
  });
}

function registerMessages(namespace, bundle) {
  i18nService.registerMessages(namespace, bundle);
}

registerGlobalI18n();

export { i18nService, normalizeLocale, registerGlobalI18n, registerMessages };
