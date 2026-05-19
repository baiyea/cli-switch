# Settings About Block

## 职责

About 区块负责展示应用版本、Logo 和静态说明。默认是 renderer-only block。

## 允许 import

- 本 block 内 `renderer/`。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import

- Home 页面或其他 Settings block 的内部实现。
- 任意 block 的私有 bridge 或 `block/shared`。
- Node.js 模块和 Electron main 代码。

## main/preload/renderer/shared/e2e 边界

- `renderer/` 放静态展示组件。
- 默认不需要 `main/`、`preload/`、`shared/`。
- 只有引入 IPC 后才创建对应运行端文件。
- E2E 非必需，除非 About 出现用户流程。

## AI 修改前先读

- `src/pages/settings/about/README.md`
- `src/pages/settings/about/block.renderer.tsx`
- `src/pages/settings/about/renderer/**`
