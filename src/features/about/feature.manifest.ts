export const aboutManifest = {
  name: "about",
  title: "About",
  description: "应用版本信息、Logo 展示（纯静态页面）",

  apiNamespace: null,

  panels: {
    settings: "about.settings",
  },

  e2e: {
    tag: "@about",
  },
} as const;
