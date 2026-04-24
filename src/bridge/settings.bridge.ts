export interface StartupEnvPair {
  key: string;
  value: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  envVars: StartupEnvPair[];
}

export interface ProviderSettingsEntry {
  defaultProfileId: string;
  enabledProfileId?: string;
  profiles: ProviderProfile[];
}

export interface ProviderSettings {
  providers: {
    claude: ProviderSettingsEntry;
    codex: ProviderSettingsEntry;
    gemini: ProviderSettingsEntry;
  };
}

export const settingsBridge = {
  getClaude(): Promise<ProviderSettings> {
    return window.electronAPI.settings.getClaude();
  },
  saveClaude(payload: ProviderSettings): Promise<ProviderSettings> {
    return window.electronAPI.settings.saveClaude(payload);
  },
  testProvider(payload: {
    provider: "claude" | "codex" | "gemini";
    profileId: string;
    envVars: StartupEnvPair[];
  }): Promise<{ ok: boolean; message: string }> {
    return window.electronAPI.settings.testProvider(payload);
  }
};
