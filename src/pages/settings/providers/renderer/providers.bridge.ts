export interface StartupEnvPair {
  key: string;
  value: string;
}

export interface ProviderSettings {
  providers: Record<
    string,
    {
      defaultProfileId: string;
      enabledProfileId?: string;
      profiles: Array<{
        id: string;
        name: string;
        envVars: StartupEnvPair[];
      }>;
    }
  >;
}

export const providersBridge = {
  settings: {
    getClaude(): Promise<ProviderSettings> {
      return window.electronAPI.settings.getClaude() as Promise<ProviderSettings>;
    },
    saveClaude(payload: ProviderSettings): Promise<ProviderSettings> {
      return window.electronAPI.settings.saveClaude(payload) as Promise<ProviderSettings>;
    },
    testProvider(payload: {
      provider: 'claude' | 'codex' | 'gemini';
      profileId: string;
      envVars: StartupEnvPair[];
    }) {
      return window.electronAPI.settings.testProvider(payload);
    },
    startProviderOAuthLogin(payload: {
      provider: 'claude' | 'codex' | 'gemini';
      profileId: string;
      projectId?: string;
      cwd?: string;
    }) {
      return window.electronAPI.settings.startProviderOAuthLogin(payload);
    },
    probeProviderOAuth(payload: {
      provider: 'claude' | 'codex' | 'gemini';
      profileId: string;
      envVars: StartupEnvPair[];
    }) {
      return window.electronAPI.settings.probeProviderOAuth(payload);
    },
    getProviderOAuthLinks(payload: {
      provider: 'claude' | 'codex' | 'gemini';
      profileId?: string;
      sessionId?: string;
    }) {
      return window.electronAPI.settings.getProviderOAuthLinks(payload);
    },
    testProviderProxy(payload: {
      provider: 'claude' | 'codex' | 'gemini';
      profileId: string;
      envVars: StartupEnvPair[];
      proxyUrl: string;
    }) {
      return window.electronAPI.settings.testProviderProxy(payload);
    },
    cleanRuntimeData() {
      return window.electronAPI.settings.cleanRuntimeData();
    },
  },
  pty: {
    input(sessionId: string, data: string): void {
      window.electronAPI.pty.input({ sessionId, data });
    },
  },
};

export const settingsBridge = providersBridge.settings;
export const ptyBridge = providersBridge.pty;
