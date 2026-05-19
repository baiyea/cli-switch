export const sidebarManifest = {
  name: 'sidebar',
  title: 'Sidebar',
  description: '项目列表、会话列表、拖拽排序、右键菜单',

  apiNamespace: 'sidebar',

  panels: {
    main: 'sidebar.main',
  },

  e2e: {
    tag: '@sidebar',
  },
} as const;
