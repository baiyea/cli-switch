# Token Usage Block

`settings/token-usage` 是 Settings 页面内的 Page Block Capsule，负责 Token 统计的 IPC、preload API、renderer 私有 bridge 和后续 UI。

## 边界

- `shared/` 只定义本 block 的 IPC channel 和 TypeScript 协议类型。
- `main/` 与 `block.main.js` 只通过 app 注入的 `tokenUsageStore`、`tokenUsageRuntime`、IPC schema 和日志函数工作，不直接持有 Settings UI 状态。
- `preload/` 只暴露 `window.electronAPI.tokenUsage.summary/refresh/status`。
- `renderer/` 只通过 `tokenUsageBridge` 调用 preload API，不 import main、preload、Node.js 模块或其他 block 的内部实现。
- app 聚合层只能 import `block.main.js` 和 `block.preload.js`，不得 import 本 block 内部实现。

Task 6 的 Settings UI 应通过 `renderer/token-usage.bridge.ts` 获取数据，不应跨 block 访问 terminal/sidebar/provider 的私有实现。
