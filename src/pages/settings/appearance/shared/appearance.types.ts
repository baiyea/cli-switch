export type AppearanceThemeMode = 'system' | 'dark' | 'light';
export type AppearanceLocale = 'zh-CN' | 'en-US';

export interface AppearanceSettings {
  themeMode: AppearanceThemeMode;
  locale: AppearanceLocale;
}
