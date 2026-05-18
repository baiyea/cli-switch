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

## 开发规范

### 文件命名规则

| 文件角色 | 命名格式 | 示例 |
|---------|---------|------|
| Block 主进程入口 | `block.main.js` | `terminal/block.main.js` |
| Block 预加载入口 | `block.preload.js` | `terminal/block.preload.js` |
| Block 渲染入口 | `block.renderer.tsx` | `terminal/block.renderer.tsx` |
| IPC 处理器 | `{block}.ipc.js`，放在 `main/` | `main/terminal.ipc.js` |
| Preload API | `{block}.api.js`，放在 `preload/` | `preload/terminal.api.js` |
| IPC Channel 定义 | `{block}.channels.js`，放在 `shared/` | `shared/terminal.channels.js` |
| Bridge（渲染端） | `{block}.bridge.ts`，放在 `renderer/` | `renderer/terminal.bridge.ts` |
| 类型定义 | `{block}.types.ts`，放在 `shared/` | `shared/terminal.types.ts` |
| E2E 测试 | `{name}.e2e.js`，放在 `e2e/` | `e2e/terminal.e2e.js` |
| Store | `{scope}.store.ts` | `pages.store.ts`、`home.store.ts` |
| 页面组件 | `{PageName}Page.tsx` | `HomePage.tsx` |
| Manifest | `{block}.manifest.ts` | `terminal.manifest.ts` |
| README | `README.md` | 每个 block 根目录必备 |

- **目录和文件一律使用 kebab-case**（如 `top-toolbar`、`file-tree`）。
- **组件文件使用 PascalCase**（如 `TopToolbar.jsx`、`TerminalPanel.tsx`）。
- **Hook 文件使用 camelCase**，以 `use-` 前缀（如 `usePty.ts`、`use-file-tree.js`）。

### 目录创建规则

1. **新增业务一律进入 `pages/{page}/{block}/`**，不直接放入 `features/` 或 `src/shared/`。
2. **按需创建子目录**——block 只需要实际用到的运行端子目录：
   - 需要主进程逻辑 → 创建 `main/`
   - 需要预加载桥接 → 创建 `preload/`
   - 有渲染组件 → 创建 `renderer/`
   - 有 IPC 通信 → 创建 `shared/`（放 channels 和 types）
   - 需要端到端测试 → 创建 `e2e/`
3. **纯渲染区块**（如 `appearance`、`about`）不强行创建 `main/`、`preload/`、`shared/`。
4. **`features/` 不主动新建目录**，只在满足提升条件后从 block 迁移过来。
5. **`kernel/db/` 子目录约束**：`migrations/` 放迁移脚本，`repositories/` 放数据访问。不在 `kernel/db/` 中写业务编排。
6. **禁止创建集中堆放目录**，如 `pages/shared/utils.ts`、`pages/shared/common.ts`、`pages/shared/helpers.ts`。

### 导入规则

1. **Block 之间禁止互相 import 内部实现**。Home 区块间通过 `pages/home/home.store.ts` 协调。
2. **Home 与 Settings 之间**只通过 `pages/pages.store.ts` 协调，不互相 import 页面内部实现。
3. **`block/shared` 是私有层**，只允许同一 block 的 `main/`、`preload/`、`renderer/`、`e2e/` 使用。其他 block 禁止 import。
4. **renderer 禁止 import**：Node.js 内置模块（`fs`、`path`、`child_process` 等）、`main/` 目录文件、`preload/` 目录文件。
5. **main 禁止 import `renderer/`** 目录文件。
6. **`app/` 聚合层**只 import page/block 的入口文件（`block.main.js`、`block.preload.js`、`block.renderer.tsx`），不 import block 内部实现。
7. **`kernel/` 不 import** 页面业务逻辑或 block 内部实现。
8. **禁止跨区块 import bridge**：每个 block 的 bridge 是私有 API，只允许当前 block 的 renderer 使用。
9. **`src/shared/` 只放全局基础类型/常量**，不放业务 bridge、IPC enum、业务 hook、业务 store、业务 service。`shared/types.ts` 不集中定义 IPC enum。
10. **新增 IPC channel 时**，定义在对应 block 的 `shared/{block}.channels.js`，不往全局文件集中堆放。

### 测试用例创建规则

1. **Block E2E 跟随区块目录**：`pages/{page}/{block}/e2e/{name}.e2e.js`
2. **全局测试基础设施**放在 `tests/e2e/`，仅保留：
   - `app-runner.js`：应用启动器
   - `index.js`：统一导出 `test`/`expect`
   - fixture、global setup/teardown、mock
3. **真实外部服务测试**（需要真实 API key 的测试）放 `docs/manual-tests/`，不纳入 CI。
4. **UI 基础组件测试**放在 `ui/` 对应组件旁，不强制 E2E。
5. E2E 测试必须满足：
   - 使用临时 userData 目录，不污染真实用户配置
   - 使用临时数据库路径
   - 可通过 `APP_E2E=1` 环境变量启动
6. 测试文件命名：
   - E2E：`{功能名}.e2e.js`（如 `terminal.e2e.js`、`clipboard-paste.e2e.js`）
   - 单元测试：`{模块名}.test.ts` 或 `{模块名}.test.js`

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
