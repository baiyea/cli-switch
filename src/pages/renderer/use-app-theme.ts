import { useEffect, useState } from 'react';

import { i18nService, normalizeLocale } from '../../i18n/renderer';
import { normalizeThemeMode, resolveEffectiveTheme, useThemeStore } from '../theme.store';

const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';

function getDarkThemeQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia(DARK_THEME_QUERY);
}

function getSystemPrefersDark(): boolean {
  const queryList = getDarkThemeQueryList();
  return queryList ? queryList.matches : true;
}

function applyDocumentTheme(effectiveTheme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.style.colorScheme = effectiveTheme;
}

export function useAppTheme() {
  const [themeReady, setThemeReady] = useState(false);
  const themeMode = useThemeStore((state) => state.themeMode);
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const setEffectiveTheme = useThemeStore((state) => state.setEffectiveTheme);

  useEffect(() => {
    let cancelled = false;

    const syncThemeMode = (nextThemeMode: unknown) => {
      const systemPrefersDark = getSystemPrefersDark();
      const normalizedThemeMode = normalizeThemeMode(nextThemeMode);
      const nextEffectiveTheme = resolveEffectiveTheme(normalizedThemeMode, systemPrefersDark);

      setThemeMode(normalizedThemeMode, systemPrefersDark);
      applyDocumentTheme(nextEffectiveTheme);
    };

    syncThemeMode('system');
    setThemeReady(true);

    (async () => {
      let nextThemeMode = 'system';
      let nextLocale = 'zh-CN';

      try {
        const settings = await window.electronAPI.appearance.get();
        nextThemeMode = normalizeThemeMode(settings?.themeMode);
        nextLocale = normalizeLocale(settings?.locale);
      } catch {
        nextThemeMode = 'system';
        nextLocale = 'zh-CN';
      }

      if (cancelled) return;
      i18nService.setLocale(nextLocale);
      syncThemeMode(nextThemeMode);
    })();

    return () => {
      cancelled = true;
    };
  }, [setThemeMode]);

  useEffect(() => {
    if (!themeReady) return;
    applyDocumentTheme(effectiveTheme);
  }, [effectiveTheme, themeReady]);

  useEffect(() => {
    if (!themeReady) return undefined;

    if (themeMode !== 'system') {
      setEffectiveTheme(resolveEffectiveTheme(themeMode, getSystemPrefersDark()));
      return undefined;
    }

    const queryList = getDarkThemeQueryList();
    if (!queryList) {
      setEffectiveTheme('dark');
      return undefined;
    }

    const syncSystemTheme = () => {
      const nextEffectiveTheme = resolveEffectiveTheme('system', queryList.matches);
      setEffectiveTheme(nextEffectiveTheme);
      applyDocumentTheme(nextEffectiveTheme);
    };

    syncSystemTheme();
    queryList.addEventListener('change', syncSystemTheme);

    return () => {
      queryList.removeEventListener('change', syncSystemTheme);
    };
  }, [setEffectiveTheme, themeMode, themeReady]);
}
