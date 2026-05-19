# Settings Appearance Block

## 职责

Appearance 区块负责主题、字体、布局等外观设置。默认是 renderer-only block。

## 允许 import

- 本 block 内 `renderer/`。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import

- Home 页面或其他 Settings block 的内部实现。
- 任意 block 的私有 bridge 或 `block/shared`。
- Node.js 模块和 Electron main 代码。

## main/preload/renderer/shared/e2e 边界

- `renderer/` 放外观设置组件。
- 默认不需要 `main/`、`preload/`、`shared/`。
- 只有引入 IPC 后才创建对应运行端文件。
- E2E 非必需，除非外观设置出现用户流程。

## AI 修改前先读

- `src/pages/settings/appearance/README.md`
- `src/pages/settings/appearance/block.renderer.tsx`
- `src/pages/settings/appearance/renderer/**`
