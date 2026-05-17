# Settings Providers Block

## 职责
Provider 设置区块负责 Claude Code、Codex CLI、Gemini CLI 的配置、连接测试、OAuth 探测、代理配置和 CLI 配置同步。跨页面可见的 Provider 状态写入 `pages.store.ts`。

## 允许 import
- `../../pages.store.ts`，读写跨页面 Provider/模型配置。
- 本 block 内 `renderer/`、`shared/`。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import
- Home 页面或 Home block 的内部实现。
- archive/about/appearance 的内部实现。
- 本 block 外的 `block/shared`。
- renderer 直接 import `main/`、`preload/` 或 Node.js 模块。

## main/preload/renderer/shared/e2e 边界
- `renderer/` 放设置表单、侧边导航、hooks 和 providers 私有 bridge。
- `main/` 放 CLI 配置同步、OAuth 探测、连接测试、Provider runtime。
- `preload/` 暴露 providers 专用 API。
- `shared/` 只放 providers channel、协议和类型。
- `e2e/` 覆盖 Provider 设置流程。

## AI 修改前先读
- `src/pages/settings/providers/README.md`
- `src/pages/settings/providers/block.renderer.tsx`
- `src/pages/settings/providers/renderer/**`
- `src/pages/pages.store.ts`
