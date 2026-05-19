# Home Sidebar Block

## 职责

左侧栏负责项目列表、会话列表、拖拽排序、重命名和归档入口。选择项目或会话时写入 `home.store.ts`，不直接驱动 terminal。

## 允许 import

- `../home.store.ts`，写入 `selectProject()`、`selectSession()` 等 Home 内共享状态。
- 本 block 内 `renderer/`、`shared/`。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import

- terminal/file-tree/top-toolbar 的内部实现或 bridge。
- Settings 页面内部实现。
- 本 block 外的 `block/shared`。
- renderer 直接 import `main/`、`preload/` 或 Node.js 模块。

## main/preload/renderer/shared/e2e 边界

- `renderer/` 放项目/会话列表组件、hooks 和 sidebar 私有 bridge。
- `main/` 放项目/会话列表相关 IPC handler。
- `preload/` 暴露 sidebar 专用 API。
- `shared/` 只放 sidebar channel 和协议。
- `e2e/` 覆盖左侧栏项目/会话交互。

## AI 修改前先读

- `src/pages/home/sidebar/README.md`
- `src/pages/home/sidebar/block.renderer.tsx`
- `src/pages/home/sidebar/renderer/**`
- `src/pages/home/home.store.ts`
