import { i18nService, normalizeLocale } from './i18n.renderer-runtime.js';
import enUSMessages from './locales/en-US.json';
import zhCNMessages from './locales/zh-CN.json';

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
