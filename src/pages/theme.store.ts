import { create } from 'zustand';

export type ThemeMode = 'system' | 'dark' | 'light';
export type EffectiveTheme = 'dark' | 'light';

interface ThemeStoreState {
  themeMode: ThemeMode;
  effectiveTheme: EffectiveTheme;
  setThemeMode: (themeMode: unknown, systemPrefersDark: boolean) => void;
  setEffectiveTheme: (effectiveTheme: EffectiveTheme) => void;
}

export function normalizeThemeMode(themeMode: unknown): ThemeMode {
  if (themeMode === 'system' || themeMode === 'dark' || themeMode === 'light') {
    return themeMode;
  }

  return 'system';
}

export function resolveEffectiveTheme(
  themeMode: unknown,
  systemPrefersDark: boolean,
): EffectiveTheme {
  const normalizedThemeMode = normalizeThemeMode(themeMode);

  if (normalizedThemeMode === 'dark' || normalizedThemeMode === 'light') {
    return normalizedThemeMode;
  }

  return systemPrefersDark ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeStoreState>((set) => ({
  themeMode: 'system',
  effectiveTheme: 'dark',

  setThemeMode(themeMode, systemPrefersDark) {
    const normalizedThemeMode = normalizeThemeMode(themeMode);
    set({
      themeMode: normalizedThemeMode,
      effectiveTheme: resolveEffectiveTheme(normalizedThemeMode, systemPrefersDark),
    });
  },

  setEffectiveTheme(effectiveTheme) {
    set({ effectiveTheme });
  },
}));
