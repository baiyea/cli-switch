# Settings Page

## 职责

Settings 页面负责组合 Provider、Archive、Appearance、About 等设置区块。跨页面共享配置通过 `../pages.store.ts` 读写。

## 允许 import

- 各 Settings block 的 `block.renderer.tsx`。
- `../pages.store.ts`，用于 Provider、模型、归档等跨页面共享状态。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import

- Home 页面或 Home block 的内部实现。
- 任意 block 的私有 bridge、`main/`、`preload/`、`shared/`。
- Node.js 模块和 Electron main 代码。

## main/preload/renderer/shared/e2e 边界

- Settings 页面本身只做布局组合。
- Provider、Archive 等运行端能力保留在对应 block。
- Settings 页面状态若只服务单个设置区块，应留在该区块内。
- 被 Home 需要的配置状态才进入 `pages.store.ts`。

## AI 修改前先读

- `src/pages/settings/README.md`
- 目标区块的 `README.md`
- `src/pages/pages.store.ts`
- 目标区块的 `block.renderer.tsx`
