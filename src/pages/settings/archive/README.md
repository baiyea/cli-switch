# Settings Archive Block

## 职责

归档设置区块负责归档会话列表、恢复和删除。只有当归档状态需要被 Home 读取时，才同步到 `pages.store.ts`。

一键清理只处理已归档且归档时间超过 30 天的会话，删除范围限定为 `sessions.session_file_path` 指向的 provider 原始会话文件和对应数据库记录，不删除 attachments、skillgen 输出、sessions dump 等衍生内容。

## 允许 import

- `../../pages.store.ts`，仅用于跨页面归档共享状态。
- 本 block 内 `renderer/`、`shared/`。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import

- Home 页面或 Home block 的内部实现。
- providers/about/appearance 的内部实现。
- 本 block 外的 `block/shared`。
- renderer 直接 import `main/`、`preload/` 或 Node.js 模块。

## main/preload/renderer/shared/e2e 边界

- `renderer/` 放归档设置组件、hooks 和 archive 私有 bridge。
- `main/` 放归档相关 IPC handler。
- `preload/` 暴露 archive 专用 API。
- `shared/` 只放 archive channel、协议和类型。
- `e2e/` 覆盖归档列表、恢复和一键清理删除。

## AI 修改前先读

- `src/pages/settings/archive/README.md`
- `src/pages/settings/archive/block.renderer.tsx`
- `src/pages/settings/archive/renderer/**`
- 必要时 `src/pages/pages.store.ts`
