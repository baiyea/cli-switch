import { useCallback, useRef, useState } from 'react';

import { useI18n } from '../../../../i18n/use-t';
import { normalizeThemeMode, resolveEffectiveTheme, useThemeStore } from '../../../theme.store';

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDocumentTheme(effectiveTheme) {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.style.colorScheme = effectiveTheme;
}

export function useAppearanceSettings() {
  const saveSequenceRef = useRef(0);
  const localeSaveSequenceRef = useRef(0);
  const { locale, setLocale, t } = useI18n();
  const themeMode = useThemeStore((state) => state.themeMode);
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const [savingMode, setSavingMode] = useState(null);
  const [savingLocale, setSavingLocale] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [lastSavedMode, setLastSavedMode] = useState(null);

  const selectThemeMode = useCallback(
    async (nextThemeMode) => {
      const normalizedThemeMode = normalizeThemeMode(nextThemeMode);
      const systemPrefersDark = getSystemPrefersDark();
      const nextEffectiveTheme = resolveEffectiveTheme(normalizedThemeMode, systemPrefersDark);
      const saveSequence = saveSequenceRef.current + 1;

      saveSequenceRef.current = saveSequence;
      setThemeMode(normalizedThemeMode, systemPrefersDark);
      applyDocumentTheme(nextEffectiveTheme);
      setSavingMode(normalizedThemeMode);
      setSaveError('');
      setLastSavedMode(null);

      try {
        const savedSettings = await window.electronAPI.appearance.set({
          themeMode: normalizedThemeMode,
        });
        const savedThemeMode = normalizeThemeMode(savedSettings?.themeMode);

        if (saveSequenceRef.current !== saveSequence) return;

        setThemeMode(savedThemeMode, getSystemPrefersDark());
        applyDocumentTheme(resolveEffectiveTheme(savedThemeMode, getSystemPrefersDark()));
        setLastSavedMode(savedThemeMode);
      } catch (error) {
        if (saveSequenceRef.current !== saveSequence) return;

        setSaveError(error?.message || t('settings.appearance.saveFailed'));
      } finally {
        if (saveSequenceRef.current === saveSequence) {
          setSavingMode(null);
        }
      }
    },
    [setThemeMode, t],
  );

  const selectLocale = useCallback(
    async (nextLocale) => {
      const previousLocale = locale;
      const saveSequence = localeSaveSequenceRef.current + 1;

      localeSaveSequenceRef.current = saveSequence;
      setLocale(nextLocale);
      setSavingLocale(nextLocale);
      setSaveError('');

      try {
        const savedSettings = await window.electronAPI.appearance.set({
          locale: nextLocale,
        });

        if (localeSaveSequenceRef.current !== saveSequence) return;

        setLocale(savedSettings?.locale || nextLocale);
      } catch {
        if (localeSaveSequenceRef.current !== saveSequence) return;

        setLocale(previousLocale);
        setSaveError(t('settings.appearance.saveLocaleFailed'));
      } finally {
        if (localeSaveSequenceRef.current === saveSequence) {
          setSavingLocale(null);
        }
      }
    },
    [locale, setLocale, t],
  );

  return {
    effectiveTheme,
    lastSavedMode,
    locale,
    saveError,
    savingLocale,
    savingMode,
    selectLocale,
    selectThemeMode,
    themeMode,
  };
}
