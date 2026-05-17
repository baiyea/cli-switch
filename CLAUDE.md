# CLAUDE.md

始终以中文简体方式回答、编写文档。

# Cli-Switch 架构与协作规则

Cli-Switch 是 Electron + React 桌面应用，当前架构以 **Page Block Capsule** 为主要修改边界：页面负责布局组合，页面内 UI 区块负责自己的 main/preload/renderer/shared/e2e。AI 修改某个区域时，应优先只读取对应 page/block 目录和必要 store。

## 当前目录职责

```text
src/
├── app/          # 应用启动和 page/block 聚合，不放业务逻辑
├── kernel/       # 基础设施：IPC 路由、SQLite、日志、配置、测试模式
├── pages/        # Page Block Capsule 主体
├── features/     # 仅放跨页面/跨窗口且复杂的独立能力
├── ui/           # 通用 UI 组件
├── shared/       # 极少量全局基础类型/常量，不放业务 bridge
├── assets/       # 静态资源
└── tests/        # 全局测试基础设施
```

`Feature Capsule` 是历史方案。现阶段新增或迁移业务优先进入 `pages/{page}/{block}`，只有满足提升条件后才进入 `features/`。

## Page Block Capsule

典型结构：

```text
src/pages/home/terminal/
├── README.md
├── block.main.js
├── block.preload.js
├── block.renderer.tsx
├── main/
├── preload/
├── renderer/
├── shared/
└── e2e/
```

规则：

- `renderer/` 只放渲染组件、hooks、区块私有 bridge。
- `main/` 只放该区块主进程实现和 IPC handler。
- `preload/` 只暴露该区块需要的安全 API。
- `shared/` 只给当前 block 的 main/preload/renderer 共享协议、channel、类型。
- `e2e/` 跟随对应 page/block。
- 区块之间禁止 import 对方内部实现。
- 区块 bridge 是私有 API，只允许当前 block renderer 使用。

## 两级 Store

### `src/pages/pages.store.ts`

职责：跨页面共享状态，例如 Home 和 Settings 都需要的 Provider 配置、模型配置、全局页面级设置、必要的归档共享状态。

禁止放：

- Home 内部的 `activeSessionId`、`activeCwd`。
- terminal/file-tree/sidebar/top-toolbar 的具体实现。
- 任意 block 的 bridge。
- PTY、OAuth、文件树读取等复杂业务 service。

### `src/pages/home/home.store.ts`

职责：Home 页面内部区块共享状态，例如 sidebar、terminal、file-tree、top-toolbar 之间联动的 `activeProjectId`、`activeSessionId`、`activeCwd`、sessions、sessionStatus。

禁止放：

- `node-pty` 进程实现。
- terminal/file-tree/sidebar/top-toolbar 的内部实现。
- 任意 block bridge 调用。
- Settings 页面状态。

## `block/shared` 与 `src/shared`

`pages/{page}/{block}/shared` 是 block 私有共享层，只能被同一 block 的 main/preload/renderer/e2e 使用。其他 block 不允许 import。

`src/shared` 只放真正全局、无业务归属的基础类型和常量，例如 `APP_NAME`、基础 `Result` 类型、平台常量。不得集中放业务 IPC enum、业务 bridge、业务 hook、业务 store、业务 service。

## features 提升条件

能力只有同时具备明确跨边界复用价值时才提升到 `src/features/`：

- 被多个页面或多个窗口使用。
- 不再依赖具体 UI 区块。
- AI 修改它时不需要理解页面布局。
- IPC channel、renderer、e2e 明显超过当前 block 归属。

不满足以上条件时，能力保留在拥有它的 page/block 内。

## 修改约束

- `app/` 只做启动和聚合，不直接 import block 内部实现。
- `kernel/` 只做基础设施，不写页面业务编排。
- renderer 不能 import Node.js 模块、main 文件或 preload 实现。
- main 不能 import renderer。
- Home 区块之间通过 `pages/home/home.store.ts` 协调，不互相调用内部 API。
- Home 与 Settings 之间通过 `pages/pages.store.ts` 协调，不互相 import 页面内部实现。
- 新增 IPC 时，channel 定义优先放在对应 block 的 `shared/` 中。

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | 启动开发环境 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动 Electron |
| `pnpm test` | 运行单元测试 |
| `pnpm test:e2e` | 运行 Playwright E2E |

## 验收重点

- `pnpm build` 通过。
- 无 renderer import main/preload/Node 模块。
- 无跨 block import 私有 bridge 或 `block/shared`。
- `pages/pages.store.ts` 只做跨页面共享状态。
- `pages/home/home.store.ts` 只做 Home 内区块共享状态。
- `features/` 只放跨页面/跨窗口复杂能力。
