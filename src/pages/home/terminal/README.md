# Home Terminal Block

## 职责
终端区块负责 xterm 渲染、node-pty 会话创建/写入/resize/销毁、会话标签和快速启动。终端读取 `home.store.ts` 的当前会话状态，但 PTY 实现保留在本 block。

## 允许 import
- `../home.store.ts`，读取 `activeSessionId`、sessions、sessionStatus 等 Home 内共享状态。
- `../../pages.store.ts`，仅在需要 Provider/模型配置时使用。
- 本 block 内 `renderer/`、`shared/`。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import
- sidebar/file-tree/top-toolbar 的内部实现或 bridge。
- Settings block 的内部实现。
- 本 block 外的 `block/shared`。
- renderer 直接 import `main/`、`preload/`、`node-pty` 或 Node.js 模块。

## main/preload/renderer/shared/e2e 边界
- `renderer/` 放 TerminalPanel、TerminalPane、SessionTabs、QuickLaunch、hooks 和 terminal 私有 bridge。
- `main/` 放 PTY service、shell 处理和 terminal IPC handler。
- `preload/` 暴露 terminal 专用 API。
- `shared/` 只放 terminal channel、协议和类型。
- `e2e/` 覆盖终端创建、切换、输入、resize、清理。

## AI 修改前先读
- `src/pages/home/terminal/README.md`
- `src/pages/home/terminal/block.renderer.tsx`
- `src/pages/home/terminal/renderer/**`
- `src/pages/home/home.store.ts`
