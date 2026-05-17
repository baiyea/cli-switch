# Feature Capsule 迁移任务清单

生成日期：2026-05-17

> 状态说明：⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 阻塞

---

## 迁移顺序

```
kernel ✅ → tests/e2e ✅ → app ✅ → terminal ✅ → workspace ✅ → sidebar ✅ → file-tree ✅ → providers ✅ → archive ✅ → about ✅ → pages ✅ → ~~ui~~ → 代码清理 → 验收
```

**第一阶段最小闭环**：kernel + tests/e2e + app + terminal，跑通"Electron 启动 → mock shell → E2E 输入输出"。

---

## 任务清单

### kernel

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| kernel | IPC 路由 | `kernel/ipc/router.ts` | —（纯基础设施，单元测试覆盖） | ✅ 已完成 | ✅ 已完成 | ✅ |
| kernel | 数据库连接 | `kernel/db/connection.ts` + `models.js` | —（纯基础设施，单元测试覆盖） | ✅ 已完成 | ✅ 已完成 | ✅ |
| kernel | Project Repository | `kernel/db/connection.js` | —（纯基础设施，单元测试覆盖） | ✅ 已完成 | ✅ 已完成 | ✅ |
| kernel | Session Repository | `kernel/db/connection.js` | —（纯基础设施，单元测试覆盖） | ✅ 已完成 | ✅ 已完成 | ✅ |
| kernel | Settings Repository | `kernel/db/connection.js` | —（纯基础设施，单元测试覆盖） | ✅ 已完成 | ✅ 已完成 | ✅ |
| kernel | 日志 | `kernel/logger.ts` | —（纯基础设施，单元测试覆盖） | ✅ 已完成 | ✅ 已完成 | ✅ |
| kernel | 配置 | `kernel/config.ts` | —（纯基础设施，单元测试覆盖） | ✅ 已完成 | ✅ 已完成 | ✅ |
| kernel | 测试模式开关 | `kernel/test-mode.ts` | 启动 APP_E2E=1 → 使用测试 DB + 关闭更新 + 启用 mock | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### tests（全局测试基础设施）

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| tests | app-runner | `tests/e2e/app-runner.ts` | `APP_E2E=1` 启动 Electron → 使用临时 userData → 窗口正常显示 → 应用可交互 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| tests | global-setup | `tests/e2e/global-setup.ts` | 创建临时目录 → 初始化测试 DB → 插入 fixture 数据 → 设置环境变量 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| tests | global-teardown | `tests/e2e/global-teardown.ts` | 关闭应用 → 清理临时目录 → 清理测试 DB → 清理环境变量 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| tests | mock-shell | `tests/mocks/mock-shell.ts` | echo hello → stdout hello / pwd → stdout /test/project / slow → 延迟 2s / error → stderr / exit → 进程退出 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| tests | mock-provider-server | `tests/mocks/mock-provider-server.ts` | /v1/models → 返回模型列表 / messages → mock 响应 / timeout → 超时 / auth-error → 401 / rate-limit → 429 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| tests | test-db fixture | `tests/fixtures/test-db.ts` | 创建测试项目/会话/Provider/归档 → 清理 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| tests | tsconfig paths | `tsconfig.json` 新增 `@test/*` 别名指向 `src/tests/*` | Feature e2e 可通过 `@test/e2e/app-runner` 引用全局基础设施 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### app（框架入口）

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| app | main.ts | `app/main.ts` | 应用启动 → 创建窗口 → 调用 registerFeatureMain() → 加载 preload → 加载 renderer → 退出时清理所有 PTY 和 DB | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| app | preload.ts | `app/preload.ts` | contextBridge 暴露 `window.api` → 包含 terminal/sidebar/fileTree/providers/archive 命名空间 → 各命名空间方法可调用 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| app | renderer.tsx | `app/renderer.tsx` | React 挂载 → 路由 `/` → HomePage, `/settings` → SettingsPage → 首页默认显示 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| app | create-window.ts | `app/create-window.ts` | 创建 BrowserWindow → 标题/尺寸正确 → preload 加载正确 → 开发模式 DevTools | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| app | register-feature-main.ts | `app/register-feature-main.ts` | 聚合调用各 feature 的 feature.main.ts → 注册所有 IPC handler | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| app | register-feature-preload.ts | `app/register-feature-preload.ts` | 聚合调用各 feature 的 feature.preload.ts → 返回合并后的 API 对象 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| app | register-feature-renderer.tsx | `app/register-feature-renderer.tsx` | 聚合各 feature 的 feature.renderer.tsx → 返回 panel 映射 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| app | package.json | `package.json` 更新 `main` 字段 → `src/app/main.ts` | Electron 启动正确加载新入口 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### terminal

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| terminal | README | `features/terminal/README.md` | —（文档） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | manifest | `features/terminal/feature.manifest.ts` | —（纯元数据，不 import 三端实现） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | shared（channels + types） | `features/terminal/shared/terminal.channels.ts` `features/terminal/shared/terminal.types.ts` | —（类型定义，通过后续功能 E2E 间接验证） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | PtyService（mock） | `features/terminal/main/pty.service.ts` | mock shell: `echo hello` → stdout `hello` / `pwd` → `/test/project` / 写入 stdin → 终端输出包含写入内容 / kill → 进程退出 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | IPC handler | `features/terminal/main/terminal.ipc.ts` | terminal:start → 返回 sessionId / terminal:write → 终端有输出 / terminal:resize → cols/rows 变化 / terminal:kill → sessionId 不可用 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | feature.main.ts | `features/terminal/feature.main.ts` | import registerTerminalIpc → 导出 registerTerminalMain() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | Preload API | `features/terminal/preload/terminal.api.ts` | `window.api.terminal.start({cwd})` 返回 sessionId / `write()` 终端响应 / `kill()` 会话销毁 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | feature.preload.ts | `features/terminal/feature.preload.ts` | import createTerminalApi → 导出 createTerminalPreloadApi() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | TerminalPane（xterm） | `features/terminal/renderer/TerminalPane.tsx` | 渲染 xterm 容器 / 接收 PTY 输出并显示 / 用户输入回显 / ANSI 颜色正确 / resize 时 cols/rows 更新 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | SessionTabs | `features/terminal/renderer/SessionTabs.tsx` | 多会话标签显示 / 点击切换终端 / 关闭标签 → PTY 被 kill / 拖拽排序标签 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | QuickLaunch | `features/terminal/renderer/QuickLaunch.tsx` | 点击快速启动 → 选择 Provider → 创建新终端会话 → 会话出现在标签栏 → 终端开始输出 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | TerminalPanel（容器） | `features/terminal/renderer/TerminalPanel.tsx` | 通过 workspace.store 获取 activeSessionId → 包含 TerminalPane + SessionTabs + QuickLaunch → 切换会话终端独立不串 → 无活跃会话显示空状态 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | feature.renderer.tsx | `features/terminal/feature.renderer.tsx` | import TerminalPanel → 导出 terminalRenderer | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | use-terminal-session | `features/terminal/renderer/use-terminal-session.ts` | hook 返回 session 状态 / 创建/切换/销毁 / 状态转换正确（starting→running→exited） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | E2E | `features/terminal/e2e/terminal.e2e.ts` | 通过 `@test/e2e/app-runner` 启动应用 → mock shell 模式 → 创建项目 → 启动终端 → 输入 echo hello → 看到 hello 输出 → 切换会话 → 关闭会话 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| terminal | E2E fixture | `features/terminal/e2e/terminal.fixture.ts` | mock terminal 数据 + 环境准备 + 清理 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### workspace

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| workspace | README | `features/workspace/README.md` | —（文档） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| workspace | manifest | `features/workspace/feature.manifest.ts` | —（纯元数据） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| workspace | shared（types） | `features/workspace/shared/workspace.types.ts` | —（类型定义） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| workspace | workspace.store | `features/workspace/renderer/workspace.store.ts` | Zustand store / activeProjectId + activeSessionId + activeCwd / selectProject() / selectSession() / clearSelection() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| workspace | use-workspace | `features/workspace/renderer/use-workspace.ts` | hook 返回 workspace 状态 / 选择 project → activeProjectId 变化 / 选择 session → activeSessionId 变化 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| workspace | feature.renderer.ts | `features/workspace/feature.renderer.ts` | 导出 workspace store 引用（无 UI 面板，纯状态） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| workspace | E2E | `features/workspace/e2e/workspace.e2e.ts` | sidebar 选项目 A session 1 → terminal 显示 session 1 / file-tree 显示项目 A → sidebar 选项目 B session 2 → terminal 切换到 session 2 / file-tree 切换到项目 B → session 1 终端内容不丢失 → 切回 session 1 内容仍存在 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### sidebar

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| sidebar | README | `features/sidebar/README.md` | —（文档） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | manifest | `features/sidebar/feature.manifest.ts` | —（纯元数据） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | shared（types） | `features/sidebar/shared/sidebar.types.ts` | —（类型定义） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | IPC handler | `features/sidebar/main/sidebar.ipc.ts` | project:list → 返回项目列表 / project:add → 新项目出现 / project:remove → 项目移除 / session:list → 返回会话列表 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | feature.main.ts | `features/sidebar/feature.main.ts` | import registerSidebarIpc → 导出 registerSidebarMain() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | Preload API | `features/sidebar/preload/sidebar.api.ts` | `window.api.sidebar.listProjects()` / `addProject()` / `listSessions(projectId)` | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | feature.preload.ts | `features/sidebar/feature.preload.ts` | import createSidebarApi → 导出 createSidebarPreloadApi() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | SidebarProjectsPanel | `features/sidebar/renderer/SidebarProjectsPanel.tsx` | 通过 workspace.store 写入 selectSession → 渲染项目列表 → 展开/折叠 → 显示会话列表 → 点击会话 → workspace.selectSession() → 空项目列表显示空状态 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | 会话拖拽排序 | 同上组件 | 拖拽会话 A → B 位置 → A 移到 B 后 → 刷新后顺序保持 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | 会话右键菜单 | 同上组件 | 右键会话 → 菜单（重命名/归档） → 重命名弹窗 → 保存 → 名称更新 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | feature.renderer.tsx | `features/sidebar/feature.renderer.tsx` | import SidebarProjectsPanel → 导出 sidebarRenderer | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | use-project-list | `features/sidebar/renderer/use-project-list.ts` | hook 返回项目列表 / 展开折叠状态 / 项目与会话关联 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| sidebar | E2E | `features/sidebar/e2e/sidebar.e2e.ts` | 通过 `@test/e2e/app-runner` 启动 → 添加项目 → 展开 → 创建会话 → 列表出现 → 拖拽排序 → 重命名 → 归档 → 列表移除 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### file-tree

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| file-tree | README | `features/file-tree/README.md` | —（文档） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | manifest | `features/file-tree/feature.manifest.ts` | —（纯元数据） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | shared（types） | `features/file-tree/shared/file-tree.types.ts` | —（类型定义） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | IPC handler | `features/file-tree/main/file-tree.ipc.ts` | file-tree:read → 返回目录树(深度限制) / file-tree:open → 调用系统默认程序 / 不存在路径 → 返回错误 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | feature.main.ts | `features/file-tree/feature.main.ts` | import registerFileTreeIpc → 导出 registerFileTreeMain() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | Preload API | `features/file-tree/preload/file-tree.api.ts` | `window.api.fileTree.readTree({cwd, depth})` 返回 items / `openPath({path})` 打开文件 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | feature.preload.ts | `features/file-tree/feature.preload.ts` | import createFileTreeApi → 导出 createFileTreePreloadApi() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | ExplorerPane | `features/file-tree/renderer/ExplorerPane.tsx` | 通过 workspace.store 获取 activeCwd → 渲染文件树 → 展开/折叠文件夹 → 点击文件触发打开 → 加载中 loading → 空目录"无文件" → Git 仓库标识 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | feature.renderer.tsx | `features/file-tree/feature.renderer.tsx` | import ExplorerPane → 导出 fileTreeRenderer | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | use-file-tree | `features/file-tree/renderer/use-file-tree.ts` | hook 返回 tree / cwd 变化自动刷新 / loading/error 状态 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| file-tree | E2E | `features/file-tree/e2e/file-tree.e2e.ts` | 通过 `@test/e2e/app-runner` 启动 → 切换项目 → 文件树显示 → 展开文件夹 → 点击文件 → 切换项目 → 文件树刷新 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### providers

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| providers | README | `features/providers/README.md` | —（文档） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | manifest | `features/providers/feature.manifest.ts` | —（纯元数据） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | shared（channels + types） | `features/providers/shared/providers.channels.ts` `features/providers/shared/providers.types.ts` | —（类型定义） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | ProviderConnectionService | `features/providers/main/provider-connection.service.ts` | mock server: 有效 Key → 成功 / 无效 Key → 失败+错误 / 超时 → 超时错误 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | OAuthProbeService | `features/providers/main/oauth-probe.service.ts` | OAuth 探测成功 → ok=true / 未登录 → ok=false | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | CliLaunchers | `features/providers/main/cli-launchers.ts` | Claude/Codex/Gemini CLI 启动命令正确 / 环境变量注入正确 / OAuth 模式命令正确 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | IPC handler | `features/providers/main/providers.ipc.ts` | providers:test → 返回结果 / providers:save → 保存成功 / providers:load → 返回配置 / providers:oauth-login → 启动 OAuth 会话 / providers:oauth-probe → 返回探测结果 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | feature.main.ts | `features/providers/feature.main.ts` | import registerProvidersIpc → 导出 registerProvidersMain() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | Preload API | `features/providers/preload/providers.api.ts` | test/save/load 方法可用 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | feature.preload.ts | `features/providers/feature.preload.ts` | import createProvidersApi → 导出 createProvidersPreloadApi() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | ProviderSettingsSection | `features/providers/renderer/ProviderSettingsSection.tsx` | 渲染 Provider 列表 / 切换 tab / 添加 Profile / 编辑名称 / 增删改环境变量 / 测试连接（成功/失败/测试中）/ 启用 Provider | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | OAuth 登录流程 | 同上组件 | 获取 OAuth 链接 → 显示链接 → 打开浏览器 → 复制链接 → 粘贴验证码 → 提交 → 回填结果 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | 代理配置 | 同上组件 | 开启代理 → 填写地址 → 测试代理 → 成功/失败 → 关闭代理 → 变量清除 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | feature.renderer.tsx | `features/providers/feature.renderer.tsx` | import ProviderSettingsSection → 导出 providersRenderer | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | use-provider-settings | `features/providers/renderer/use-provider-settings.ts` | hook 返回配置 / 更新/保存/测试状态变化 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| providers | E2E | `features/providers/e2e/providers.e2e.ts` | 通过 `@test/e2e/app-runner` 启动 → 打开设置 → 切换 Claude tab → 添加 Profile → 填写 API Key → 测试连接成功 → 启用 → 保存 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### archive

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| archive | README | `features/archive/README.md` | —（文档） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | manifest | `features/archive/feature.manifest.ts` | —（纯元数据） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | shared（types） | `features/archive/shared/archive.types.ts` | —（类型定义） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | IPC handler | `features/archive/main/archive.ipc.ts` | archive:list → 返回归档列表 / archive:restore → 恢复到活跃列表 / archive:delete → 永久删除 / 空列表 → 空状态 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | feature.main.ts | `features/archive/feature.main.ts` | import registerArchiveIpc → 导出 registerArchiveMain() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | Preload API | `features/archive/preload/archive.api.ts` | `window.api.archive.list()` / `restore({archiveId})` / `delete({archiveId})` | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | feature.preload.ts | `features/archive/feature.preload.ts` | import createArchiveApi → 导出 createArchivePreloadApi() | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | ArchiveSettingsSection | `features/archive/renderer/ArchiveSettingsSection.tsx` | 渲染归档列表 / 显示名称时间Provider / 点击恢复 → 会话回到活跃 → 点击删除 → 确认弹窗 → 删除 → 空列表空状态 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | feature.renderer.tsx | `features/archive/feature.renderer.tsx` | import ArchiveSettingsSection → 导出 archiveRenderer | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | use-archive-list | `features/archive/renderer/use-archive-list.ts` | hook 返回归档列表 / 恢复删除后刷新 / loading/error | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| archive | E2E | `features/archive/e2e/archive.e2e.ts` | 通过 `@test/e2e/app-runner` 启动 → 归档会话 → 打开设置归档 tab → 显示 → 恢复 → 侧边栏出现 → 再次归档 → 删除 → 列表为空 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### about

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| about | README | `features/about/README.md` | —（文档） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| about | manifest | `features/about/feature.manifest.ts` | —（纯元数据） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| about | AboutSettingsSection | `features/about/renderer/AboutSettingsSection.tsx` | 渲染版本号 + Logo → 版本号与 package.json 一致 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| about | feature.renderer.tsx | `features/about/feature.renderer.tsx` | import AboutSettingsSection → 导出 aboutRenderer | | | ✅ 已完成 | ✅ 已完成 | ✅ |

> about 是纯静态页面，无需 main/preload/e2e。

---

### pages

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| pages | HomePage | `pages/HomePage.tsx` | 渲染首页 → 包含 Sidebar + Terminal + FileTree → Sidebar 左侧 / Terminal 中间 / FileTree 右侧(可折叠) → 无项目显示 WelcomeView | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| pages | SettingsPage | `pages/SettingsPage.tsx` | 点击设置 → 跳转设置页 → 左侧导航(Providers/Archive/About) → 点击切换右侧 → 左上角返回按钮 → 点击返回首页 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| pages | 页面路由 | `app/renderer.tsx` | `/` → HomePage / `/settings` → SettingsPage / 刷新保持路由 / 直接访问 `/settings` 正常 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### ui（通用组件 — 仅组件测试，不强制 E2E）

| 1级名称 | 2级名称 | 输出产物 | 测试方式 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| ui | Button | `ui/button.tsx` | 组件测试：渲染 variant / 点击触发 onClick | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | Dialog | `ui/dialog.tsx` | 组件测试：打开/关闭/ESC 关闭 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | Input | `ui/input.tsx` | 组件测试：输入/placeholder/disabled | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | Select | `ui/select.tsx` | 组件测试：打开下拉/选择/键盘操作 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | Switch | `ui/switch.tsx` | 组件测试：切换状态/disabled | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | Tabs | `ui/tabs.tsx` | 组件测试：切换面板/内容显示 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | Badge | `ui/badge.tsx` | 组件测试：渲染/variant 样式 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | Card | `ui/card.tsx` | 组件测试：渲染/header/body/footer | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| ui | AlertDialog | `ui/alert-dialog.tsx` | 组件测试：确认/取消回调 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### assets & shared

| 1级名称 | 2级名称 | 输出产物 | 测试方式 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| assets | brand | `assets/brand/` | —（静态资源） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| assets | provider-icons | `assets/provider-icons/` | —（静态资源） | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| shared | app-config | `shared/app-config.ts` | —（常量定义） | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### 代码清理

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| 清理 | 删除旧 electron/ | 移除 `src/electron/` | `pnpm build` 成功 → `pnpm test:e2e` 全部通过 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| 清理 | 删除旧 bridge/ | 移除 `src/bridge/` | 无 import 报错 → build 成功 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| 清理 | 删除旧 renderer/ | 移除 `src/renderer/` | 无 import 报错 → build 成功 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| 清理 | 删除旧 features/ | 移除 `src/features/`（已迁移至新 features/） | build 成功 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| 清理 | 删除旧 main/ | 移除 `src/main/`（已迁移至 kernel/） | build 成功 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| 清理 | 删除旧 store/ | 移除 `src/store/`（已迁移至 workspace + 各 feature 内部） | build 成功 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

### 验收

| 1级名称 | 2级名称 | 输出产物 | E2E 测试用例 | 开始时间 | 完成时间 | 状态 |
|---|---|---|---|---|---|---|
| 验收 | 构建 | — | `pnpm build` 成功 → 无 TS 错误 → 无 import 错误 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| 验收 | 全量 E2E | — | 所有 feature 的 E2E 用例通过 → workspace 联动 E2E 通过 | | | ✅ 已完成 | ✅ 已完成 | ✅ |
| 验收 | AI 可读性 | — | Claude Code 读取 `features/terminal/**` → 不读其他 feature 即可理解终端完整实现 | | | ✅ 已完成 | ✅ 已完成 | ✅ |

---

## 统计

| 1级 | 任务数 |
|---|---|
| kernel | 8 |
| tests | 7 |
| app | 8 |
| terminal | 16 |
| workspace | 7 |
| sidebar | 13 |
| file-tree | 11 |
| providers | 16 |
| archive | 11 |
| about | 4 |
| pages | 3 |
| ui | 9 |
| assets & shared | 3 |
| 代码清理 | 6 |
| 验收 | 3 |
| **合计** | **125** |
