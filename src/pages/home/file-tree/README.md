# Home File Tree Block

## 职责

文件树区块负责浏览当前项目目录、展开/折叠文件夹、展示文件状态和文件点击操作。它读取 `home.store.ts` 的 `activeCwd`，不直接了解 sidebar 或 terminal。

## 允许 import

- `../home.store.ts`，读取当前项目目录和会话上下文。
- 本 block 内 `renderer/`、`shared/`。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import

- terminal/sidebar/top-toolbar 的内部实现或 bridge。
- Settings block 的内部实现。
- 本 block 外的 `block/shared`。
- renderer 直接 import `main/`、`preload/`、`fs` 或其他 Node.js 模块。

## main/preload/renderer/shared/e2e 边界

- `renderer/` 放 ExplorerPane、use-file-tree 和 file-tree 私有 bridge。
- `main/` 放文件读取相关 IPC handler。
- `preload/` 暴露 file-tree 专用 API。
- `shared/` 只放 file-tree channel、协议和类型。
- `e2e/` 覆盖目录加载、展开和选择。

## AI 修改前先读

- `src/pages/home/file-tree/README.md`
- `src/pages/home/file-tree/block.renderer.tsx`
- `src/pages/home/file-tree/renderer/**`
- `src/pages/home/home.store.ts`
