export const appearanceManifest = {
  name: 'appearance',
  title: 'Appearance',
  description: '主题、字体、布局等外观设置',

  apiNamespace: null,

  panels: {
    settings: 'appearance.settings',
  },

  e2e: {
    tag: '@appearance',
  },
} as const;
