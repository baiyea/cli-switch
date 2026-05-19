export const archiveManifest = {
  name: 'archive',
  title: 'Archive',
  description: '归档会话列表、恢复、删除',

  apiNamespace: 'archive',

  panels: {
    settings: 'archive.settings',
  },

  e2e: {
    tag: '@archive',
  },
} as const;
