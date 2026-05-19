# Home Page

## 职责

Home 页面负责组合顶部工具栏、左侧栏、终端和文件树。跨 Home 区块的共享状态放在 `home.store.ts`。

## 允许 import

- `./home.store.ts`、`./home.types.ts`。
- 各 Home block 的 `block.renderer.tsx`。
- `../pages.store.ts`，仅在需要跨页面共享状态时使用。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import

- 任意 block 的 `main/`、`preload/`、`shared/`、私有 bridge。
- Settings 页面内部实现。
- Node.js 模块和 Electron main 代码。

## main/preload/renderer/shared/e2e 边界

- Home 页面本身只做布局组合。
- 区块运行端能力保留在对应 `sidebar/`、`terminal/`、`file-tree/`、`top-toolbar/`。
- `home.store.ts` 只做 Home 内区块共享状态，不放 PTY、文件系统、Provider OAuth 等实现。
- Home 级 E2E 可覆盖多个 Home 区块联动。

## AI 修改前先读

- `src/pages/home/README.md`
- `src/pages/home/home.store.ts`
- 目标区块的 `README.md`
- 目标区块的 `block.renderer.tsx`
