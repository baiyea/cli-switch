const VALID_THEME_MODES = new Set(['system', 'dark', 'light']);

function normalizeThemeMode(themeMode) {
  return VALID_THEME_MODES.has(themeMode) ? themeMode : 'system';
}

function resolveEffectiveTheme(themeMode, systemPrefersDark) {
  const normalizedThemeMode = normalizeThemeMode(themeMode);

  if (normalizedThemeMode === 'dark' || normalizedThemeMode === 'light') {
    return normalizedThemeMode;
  }

  return systemPrefersDark ? 'dark' : 'light';
}

module.exports = {
  normalizeThemeMode,
  resolveEffectiveTheme,
};
