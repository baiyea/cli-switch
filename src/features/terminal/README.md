# Terminal Feature

## 职责
管理 node-pty 终端会话的创建、写入、resize、销毁。

## 文件边界
- renderer/  — xterm 渲染组件
- preload/   — 终端 API 暴露
- main/      — PTY 服务 + IPC handler
- shared/    — IPC channel 常量
- e2e/       — 终端 E2E 测试

## 禁止事项
- renderer 不能 import main/
- 不能直接操作数据库
- 不能跨 feature 内部调用（只通过 workspace.store 通信）

## API
- window.api.terminal.start({ cwd, name }) → { sessionId, name }
- window.api.terminal.write({ sessionId, data })
- window.api.terminal.resize({ sessionId, cols, rows })
- window.api.terminal.kill({ sessionId })
- window.api.terminal.snapshot({ sessionId }) → string
- window.api.terminal.onData(callback) → unsubscribe
- window.api.terminal.onExit(callback) → unsubscribe
