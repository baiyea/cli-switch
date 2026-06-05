import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

import { I18nContext } from './I18nProvider';
import type { I18nContextValue, TFunction } from './I18nProvider';
import type { Locale } from './i18n.types';
import { i18nService, normalizeLocale } from './renderer';

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  const fallbackLocale = useSyncExternalStore(
    (listener) => i18nService.subscribe(listener),
    () => i18nService.getLocale() as Locale,
    () => i18nService.getLocale() as Locale,
  );

  const setLocale = useCallback((nextLocale: Locale | string) => {
    return i18nService.setLocale(normalizeLocale(nextLocale)) as Locale;
  }, []);

  const t = useCallback<TFunction>((key, params) => {
    return i18nService.t(key, params);
  }, []);

  const fallbackContext = useMemo<I18nContextValue>(() => {
    return {
      locale: fallbackLocale,
      setLocale,
      t,
    };
  }, [fallbackLocale, setLocale, t]);

  return context ?? fallbackContext;
}

export function useT(): TFunction {
  return useI18n().t;
}
