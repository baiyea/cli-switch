import { ProviderSettingsSection } from "./renderer/ProviderSettingsSection";
import { SettingsModal } from "./renderer/SettingsModal";
import { SettingsSideNav } from "./renderer/SettingsSideNav";

export const providersRenderer = {
  panels: {
    settings: ProviderSettingsSection,
    modal: SettingsModal,
    sideNav: SettingsSideNav,
  },
};
