export const terminalManifest = {
  name: 'terminal',
  title: 'Terminal',
  description: '终端会话管理、xterm 渲染、PTY 输入输出',

  apiNamespace: 'terminal',

  panels: {
    main: 'terminal.main',
  },

  e2e: {
    tag: '@terminal',
  },
} as const;
