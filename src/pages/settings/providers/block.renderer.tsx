import { ProviderSettingsSection } from './renderer/ProviderSettingsSection';
import { useProviderSettings } from './renderer/use-provider-settings';

export const providersRenderer = {
  panels: {
    settings: ProviderSettingsSection,
  },
};

export { ProviderSettingsSection, useProviderSettings };
