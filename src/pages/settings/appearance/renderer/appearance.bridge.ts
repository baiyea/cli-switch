import type { AppearanceSettings, AppearanceSettingsPatch } from '../shared/appearance.types';

export const appearanceBridge = {
  get(): Promise<AppearanceSettings> {
    return window.electronAPI.appearance.get();
  },
  set(payload: AppearanceSettingsPatch): Promise<AppearanceSettings> {
    return window.electronAPI.appearance.set(payload);
  },
};

export type {
  AppearanceSettings,
  AppearanceSettingsPatch,
  AppearanceThemeMode,
} from '../shared/appearance.types';
