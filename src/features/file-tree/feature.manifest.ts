export const fileTreeManifest = {
  name: "file-tree",
  title: "File Tree",
  description: "项目文件树浏览、展开折叠、文件打开",

  apiNamespace: "fileTree",

  panels: {
    main: "file-tree.main",
  },

  e2e: {
    tag: "@file-tree",
  },
} as const;
