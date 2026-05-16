# Providers Feature

## 职责
Claude Code / Codex CLI / Gemini CLI 三个 Provider 的配置管理。
包括 API Key 配置、连接测试、OAuth 登录/探测、代理配置。

## 禁止事项
- 不直接修改 CLI 配置文件（通过 cli-config-sync-service）
- 跨 feature 通信只通过 workspace.store
