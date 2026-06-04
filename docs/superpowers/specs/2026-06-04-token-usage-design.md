# Token 消耗统计 · 设计文档

**日期**: 2026-06-04
**状态**: 已确认

---

## 1. 需求概述

在 Settings 中新增 `Token 统计` 页面，用于查看当前应用数据库中已登记项目和会话的 token 消耗。首版聚焦项目级和全局历史统计，不做成本金额、预算提醒，也不全量扫描用户机器上的 Claude/Codex/Gemini 历史目录。

统计需要区分 `provider` 与底层大模型。例如 `provider=claude` 只是 Claude Code CLI 适配器，实际可能通过不同环境变量接入 Kimi、DeepSeek、MiniMax 或 Anthropic。统计归属不能只按 `provider` 聚合。

## 2. 范围

首版包含：

- 总 token、输入、输出、缓存、reasoning、tool、轮次。
- 按项目、provider、模型聚合。
- 最近 7 天、最近 30 天、全部时间筛选。
- 日趋势，按最后活跃日期归属。
- 会话排行。
- 手动重新扫描。
- 打开页面时先读缓存，再后台增量补扫。

首版不包含：

- 成本金额和价格配置。
- 预算提醒。
- 全量扫描未登记的 CLI 历史文件。
- 按消息事件时间精确分摊到每天。

## 3. 入口与 UI

新增 Settings 内部区块：

```text
src/pages/settings/token-usage/
```

UI 布局已通过 visual companion 确认。页面结构：

- 左侧 Settings nav 增加 `Token 统计`。
- 顶部显示同步状态和 `重新扫描` 按钮。
- 筛选区包含时间范围、项目、provider、模型。
- 指标卡展示总量和分项 token。
- 日趋势展示最近日期的 token 聚合。
- 模型汇总按运行段快照聚合，例如 `claude / kimi-for-coding` 与 `claude / deepseek-v4-pro` 分开。
- 会话排行展示项目、provider、模型、token、最后活跃时间。

## 4. 统计归属

核心归属单位是“运行段”，不是“会话”。

同一个会话可能多次启动或恢复。每次启动/恢复时，主进程读取当时启用的 provider profile 和环境变量，生成运行段快照：

```text
project
  session(provider=claude, provider_session_id=xxx)
    run 1: profile=Kimi, model=kimi-for-coding, base=api.moonshot.cn
    run 2: profile=DeepSeek, model=deepseek-v4-pro, base=api.deepseek.com
```

这样同一会话在不同时间用不同模型恢复时，token 可以归属到对应运行段。

历史旧会话没有运行段快照，统一归为 `unknown`，UI 显示为“未知模型/历史会话”。不要把历史会话强行归属到当前 active profile，避免制造错误精度。

## 5. 数据模型

建议新增两张表。

### token_usage_runs

记录每次会话启动/恢复时的模型环境快照：

```text
id
project_id
session_id
provider
provider_session_id
profile_id
profile_name
model_name
api_base_host
env_fingerprint
session_file_path
run_started_at
run_ended_at
created_at
updated_at
```

说明：

- `model_name` 从关键环境变量解析，例如 `ANTHROPIC_MODEL`、`OPENAI_MODEL`、`GEMINI_MODEL`、`MODEL`。
- `api_base_host` 从 base URL 类环境变量解析，只存 host 或脱敏后的标识。
- `env_fingerprint` 对关键环境变量做稳定 hash，用于判断配置是否变化。
- profile 删除或改名后，运行段仍保留启动时快照。

### token_usage_snapshots

记录运行段当前累计统计和文件指纹：

```text
run_id
file_mtime_ms
file_size
stats_ended_at
input_tokens
output_tokens
cached_tokens
reasoning_tokens
tool_tokens
total_tokens
rounds
source_missing
last_error
updated_at
```

## 6. 同步流程

页面加载：

```text
进入 Token 统计页
  → TOKEN_USAGE_SUMMARY 读取缓存聚合并立即渲染
  → 后台触发 TOKEN_USAGE_REFRESH
  → 扫描 DB 已登记 sessions
  → 文件变化时解析 token 并更新快照
  → 再次刷新 SUMMARY
```

增量规则：

- 只读取 `sessions.session_file_path` 非空且属于当前数据库会话的文件。
- 通过 `mtime + size` 判断文件是否变化，未变化直接跳过。
- 解析复用现有 provider-specific token 解析能力。
- Provider 文件通常提供累计 token；同步时将“当前累计值 - 上次快照累计值”的差额归属到当前运行段。
- 如果没有可匹配运行段，则写入 `unknown` 运行段。
- PTY exit 时做一次最终同步，补齐 `run_ended_at`。

日期归属：

- 日趋势按最后活跃时间归属。
- 优先级建议：`stats_ended_at` → `run_ended_at` → `sessions.updated_at`。

## 7. IPC 与区块边界

新增 `settings/token-usage` block，遵守 Page Block Capsule：

```text
src/pages/settings/token-usage/
├── block.main.js
├── block.preload.js
├── block.renderer.tsx
├── main/
├── preload/
├── renderer/
├── shared/
└── e2e/
```

建议 IPC：

```text
TOKEN_USAGE_SUMMARY
TOKEN_USAGE_REFRESH
TOKEN_USAGE_REFRESH_STATUS
```

边界要求：

- channel 定义放在 `settings/token-usage/shared/`。
- renderer 只通过 token-usage 私有 bridge 调用 preload API。
- main 侧只做统计 IPC、同步服务和查询聚合。
- 解析会话文件的通用能力若需要跨 block 使用，应提升到合适的 page/kernel 服务；不能让 settings block 直接 import terminal renderer 或私有 bridge。

## 8. 错误处理

| 场景 | 行为 |
|------|------|
| 会话文件不存在 | 保留旧缓存，标记 `source_missing` |
| 文件解析失败 | 保留旧缓存，写入 `last_error` |
| token 字段不可用 | 轮次/时长可展示，token 显示不可用 |
| profile 被删除 | 使用运行段保存的历史 profile 快照 |
| 同一会话跨模型恢复 | 按不同运行段分别聚合 |
| 历史会话无运行段 | 归入 `unknown` |

## 9. 验收条件

- [ ] Settings nav 出现 `Token 统计`。
- [ ] 页面首屏可以从缓存展示总 token、分项 token、日趋势、模型汇总、会话排行。
- [ ] `claude + kimi-for-coding` 与 `claude + deepseek-v4-pro` 分开统计。
- [ ] 同一 session 多个运行段不会混成一个模型。
- [ ] 文件未变化时刷新不会重复累计。
- [ ] 文件缺失或解析失败时页面仍能展示已有缓存。
- [ ] 历史无运行段会话显示为“未知模型”。
- [ ] 日期筛选按最后活跃日期归属。
- [ ] 不扫描未登记到数据库的 CLI 历史文件。
- [ ] 无 renderer 直接 import Node.js、main 或 preload。
