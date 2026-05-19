export interface EnvVarPair {
  key: string;
  value: string;
}

export interface EnvVarMeta extends EnvVarPair {
  editable: boolean;
  required: boolean;
  keyEditable: boolean;
  removable: boolean;
}

export interface ProviderProfile {
  id: string;
  name: string;
  envVars: EnvVarMeta[];
}

export interface ProviderEntry {
  defaultProfileId: string;
  enabledProfileId: string;
  profiles: ProviderProfile[];
}

export interface ProviderSettings {
  claude: ProviderEntry;
  codex: ProviderEntry;
  gemini: ProviderEntry;
}

export interface OAuthState {
  authUrls: string[];
  allUrls: string[];
  error?: string;
}

export interface ProxyTestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
}

export type ProviderId = 'claude' | 'codex' | 'gemini';
