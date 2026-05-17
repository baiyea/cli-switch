# Home Shared Legacy Area

## 职责
此目录是 Home 迁移过程中的临时共享区，存放尚未收敛到 `home.store.ts` 或具体 Home block 的旧 workspace/session 代码。

## 允许 import
- `../home.store.ts`，当代码迁移到新的 Home store 后使用。
- 无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import
- terminal/sidebar/file-tree/top-toolbar 的私有 bridge。
- Settings 页面内部实现。
- 任意 block 的 `main/`、`preload/`。
- 新增长期业务能力到此目录。

## main/preload/renderer/shared/e2e 边界
- 新代码不应继续扩展此目录。
- Home 内共享状态应迁移到 `src/pages/home/home.store.ts`。
- 只属于某个 UI 区块的逻辑应下沉到对应 block。
- 跨页面共享状态应进入 `src/pages/pages.store.ts`。

## AI 修改前先读
- `src/pages/home/shared/README.md`
- `src/pages/home/home.store.ts`
- 具体目标 block 的 `README.md`
