export const topToolbarManifest = {
  name: "top-toolbar",
  title: "Top Toolbar",
  description: "顶部工具栏：窗口控制、会话信息、Skillgen、文件树切换",

  apiNamespace: "topToolbar",

  panels: {
    toolbar: "topToolbar.toolbar",
    skillgen: "topToolbar.skillgen",
  },

  e2e: {
    tag: "@top-toolbar",
  },
} as const;
