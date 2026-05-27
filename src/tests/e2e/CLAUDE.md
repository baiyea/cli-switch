# CLAUDE.md

## E2E 测试说明

### 如何进行测试

1. 运行全部 E2E（无窗口，CI/本地回归）：`pnpm test:e2e`
2. 运行全部 E2E（有窗口，便于观察）：`pnpm test:e2e:headed`
3. 运行单个文件：`pnpm exec playwright test src/pages/<page>/<block>/e2e/<name>.e2e.js`

### 测试结果在哪里查看

- 汇总报告：`docs/test-results/summary.md`
- 用例明细：`docs/test-results/details/cases/`
- 原始产物（trace/screenshot/video）：`docs/test-results/details/raw/`

## E2E 测试用例汇总

- 扫描范围：`src/pages/**/e2e/*.e2e.js`
- 测试文件数：16
- 生成时间：2026-05-27

### pages/home

| 测试目的 | 测试用例文件路径 |
|---|---|
| 切换项目会话后同步更新文件树 cwd 与活动终端 | src/pages/home/e2e/workspace-sync.e2e.js |
| 文件树展开/收起与文件打开（待补充） | src/pages/home/file-tree/e2e/file-tree.e2e.js |
| 项目增删改与会话列表交互（待补充） | src/pages/home/sidebar/e2e/sidebar.e2e.js |
| Claude 自动响应：主题选择/工作区信任提示自动回车；去重防止重复回车；仅对 Claude provider 生效 | src/pages/home/terminal/e2e/claude-auto-response.e2e.js |
| 终端粘贴与附件链路：图片粘贴拦截与落盘、文本粘贴放行、复制粘贴快捷键拦截、菜单行为、平台差异、IPC 通道与多格式保存 | src/pages/home/terminal/e2e/clipboard-paste.e2e.js |
| 终端核心流转：快速启动创建会话、会话切换状态、窗口 resize 触发重排、滚动保持、归档后渲染稳定、Explorer 高度布局正确 | src/pages/home/terminal/e2e/flow-terminal.e2e.js |
| 多 provider 会话恢复：跨 provider 发现与恢复、归档 ID 规则、反复切换不重复注入 resume | src/pages/home/terminal/e2e/multi-cli-session.e2e.js |
| PTY 退出清理：关闭应用销毁会话、清空缓冲、多会话清理、Windows 清理不抛错 | src/pages/home/terminal/e2e/pty-cleanup.e2e.js |
| 窗口控制行为：最小化/最大化/关闭按钮与 macOS 隐藏策略 | src/pages/home/top-toolbar/e2e/window-controls.e2e.js |

### pages/settings

| 测试目的 | 测试用例文件路径 |
|---|---|
| 归档列表、恢复与永久删除（待补充） | src/pages/settings/archive/e2e/archive.e2e.js |
| Claude DeepSeek 配置可在设置页保存，并可启动会话获得回复 | src/pages/settings/providers/e2e/providers-claude-deepseek.e2e.js |
| Codex OAuth 可启动并在人工交互后启用 | src/pages/settings/providers/e2e/providers-codex-oauth.e2e.js |
| Gemini OAuth 可启动并在人工交互后启用 | src/pages/settings/providers/e2e/providers-gemini-oauth.e2e.js |
| OAuth 测试会话跨 provider 复用固定 singleton 记录 | src/pages/settings/providers/e2e/providers-oauth-session-reuse.e2e.js |
| Claude/Codex/Gemini 三个 tab 的代理配置可通过连通性检测 | src/pages/settings/providers/e2e/providers-proxy.e2e.js |
| Provider 增删改与连接测试（待补充） | src/pages/settings/providers/e2e/providers.e2e.js |

## 重复测试与合并建议

### 高优先级：OAuth 测试合并

`providers-codex-oauth.e2e.js` 与 `providers-gemini-oauth.e2e.js` 结构几乎完全一致，区别仅在于操作不同 provider tab，且均被 CI 跳过（需人工交互）。建议合并为 `providers-oauth.e2e.js`，通过参数化 provider 减少重复代码。

`providers-oauth-session-reuse.e2e.js` 涉及多个 provider 的 OAuth session 复用，若合并上述两个文件，可将 session 复用逻辑一并纳入，最终一个 `providers-oauth.e2e.js` 覆盖所有 OAuth 场景。
