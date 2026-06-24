import type { ReactNode } from 'react';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import type { Locale, TranslationParams } from './i18n.types';
import { i18nService, normalizeLocale } from './renderer';

export type TFunction = (key: string, params?: TranslationParams) => string;

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale | string) => Locale;
  t: TFunction;
};

type I18nProviderProps = {
  children: ReactNode;
  initialLocale?: Locale | string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initialLocale = 'zh-CN' }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return i18nService.setLocale(normalizeLocale(initialLocale)) as Locale;
  });

  useEffect(() => {
    return i18nService.subscribe((nextLocale) => {
      setLocaleState(nextLocale as Locale);
    });
  }, []);

  useEffect(() => {
    const nextLocale = i18nService.setLocale(normalizeLocale(initialLocale)) as Locale;
    setLocaleState(nextLocale);
  }, [initialLocale]);

  const setLocale = useCallback((nextLocale: Locale | string) => {
    const normalizedLocale = normalizeLocale(nextLocale);
    const appliedLocale = i18nService.setLocale(normalizedLocale) as Locale;
    setLocaleState(appliedLocale);
    return appliedLocale;
  }, []);

  const t = useCallback<TFunction>((key, params) => {
    return i18nService.t(key, params);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale,
      t,
    };
  }, [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
