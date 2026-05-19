export const providersManifest = {
  name: 'providers',
  title: 'Providers',
  description: 'Claude/Codex/Gemini Provider 配置、API Key 测试、OAuth 登录、代理设置',

  apiNamespace: 'providers',

  panels: {
    settings: 'providers.settings',
  },

  e2e: {
    tag: '@providers',
  },
} as const;
