# Skillgen Capsule

## 职责
Skillgen 是 Home 顶部工具栏下的子能力，负责从工作区内容生成、评分、归一化和写入技能结果。

## 允许 import
- `../` 顶部工具栏公开入口或本目录内部文件。
- `../../home.store.ts`，仅在需要当前项目/cwd/session 上下文时使用。
- `../../../pages.store.ts`，仅在需要跨页面 Provider 配置时使用。
- `src/ui` 和无业务归属的 `src/shared` 基础类型/常量。

## 禁止 import
- terminal/sidebar/file-tree 的内部实现或 bridge。
- Settings block 的内部实现。
- 本 capsule 外的 `block/shared` 私有协议。
- renderer 直接 import main 或 Node.js 模块。

## main/preload/renderer/shared/e2e 边界
- `renderer/` 放结果弹窗和运行 hook。
- `main/` 放 runner、extractor、ingest、normalize、scorer、writer。
- `preload/` 暴露 skillgen 专用 API。
- `shared/` 放 skillgen channel 和协议，仅供 skillgen/顶部工具栏内部使用。
- `e2e/` 覆盖 skillgen 用户流程。

## AI 修改前先读
- `src/pages/home/top-toolbar/skillgen/README.md`
- `src/pages/home/top-toolbar/README.md`
- `src/pages/home/top-toolbar/skillgen/**`
- 必要时 `src/pages/pages.store.ts`
