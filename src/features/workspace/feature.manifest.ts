export const workspaceManifest = {
  name: "workspace",
  title: "Workspace",
  description:
    "跨 feature UI 状态协调：activeProjectId / activeSessionId / activeCwd",

  apiNamespace: "workspace",

  panels: {},

  e2e: {
    tag: "@workspace",
  },
} as const;
