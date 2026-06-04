# kernel/db — 数据库层

## ORM 概述

不使用第三方 ORM，基于 `better-sqlite3` + 手动 schema 管理。表模型、DDL 构建、迁移、连接管理全部在 `kernel/db/` 内闭环，不依赖外部 ORM 框架。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `connection.js` | 数据库连接管理（初始化、获取、关闭），导出各 repo 工厂函数 |
| `models.js` → `schema.js` | 表模型定义与 DDL 构建（`CREATE TABLE`、`CREATE INDEX`） |
| `repositories/` | 数据访问层，每个 repo 封装对特定表的 CRUD + 业务查询 |
| `migrations/` | 增量迁移脚本，用于追加列、创建索引、数据修复 |

## 连接管理 (`connection.js`)

- **`initDatabase(dbPath?)`**：创建 WAL 模式连接，执行建表语句，运行迁移。幂等可重复调用。
- **`getDatabase()`**：获取已初始化的 `better-sqlite3` 实例。
- **`closeDatabase()`**：关闭连接。
- **`resolveConn(conn)`**：若传入外部 conn 则使用外部，否则回退 `getDatabase()`。支持事务场景。

## 表结构与关系

### ER 图

```
projects (1) ──< (N) sessions
    │                   │
    │                   └──< (N) token_usage_runs (1) ── (1) token_usage_snapshots
    │
    └──────< (N) token_usage_runs
┌──────────┐      ┌──────────────┐
│ id (PK)  │◄─────│ project_id   │
│ name     │      │ id (PK)      │
│ path     │      │ provider     │
│ default_ │      │ provider_    │
│ provider │      │ session_id   │
│ created  │      │ status       │
│ updated  │      │ ...          │
└──────────┘      └──────────────┘

app_settings（独立键值表，无外键关系）
┌──────────────┐
│ key (PK)     │
│ value        │
│ updated_at   │
└──────────────┘
```

### `projects` — 工作区项目

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | UUID 主键 |
| `name` | TEXT | NOT NULL | 项目显示名称 |
| `path` | TEXT | NOT NULL, UNIQUE | 项目绝对路径（工作目录），唯一 |
| `default_provider` | TEXT | NOT NULL, DEFAULT 'claude' | 项目默认 CLI 提供商（claude/codex/gemini） |
| `created_at` | TEXT | NOT NULL | 创建时间（ISO 字符串） |
| `updated_at` | TEXT | NOT NULL | 最后更新时间（ISO 字符串） |

### `sessions` — 会话与运行状态

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | UUID 主键 |
| `project_id` | TEXT | NOT NULL, FK → projects.id | 所属项目 |
| `title` | TEXT | NOT NULL | 会话标题 |
| `provider` | TEXT | NOT NULL | CLI 来源（claude/codex/gemini） |
| `provider_session_id` | TEXT | NOT NULL | CLI 原生会话 ID，与 provider 组成唯一键 |
| `cwd` | TEXT | NOT NULL, DEFAULT '' | 兼容字段：历史会话工作目录（当前以 project.path 为准） |
| `session_file_path` | TEXT | - | 会话实体文件路径（如 `*.jsonl`/`*.json`），无文件时为 NULL |
| `status` | TEXT | NOT NULL | 会话状态：`idle` / `running` / `exited` |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 | 拖拽排序权重，同项目内越大越靠前 |
| `last_active_at` | TEXT | NOT NULL | 最近活跃时间（ISO 字符串） |
| `created_at` | TEXT | NOT NULL | 创建时间（ISO 字符串） |
| `updated_at` | TEXT | NOT NULL | 最后更新时间（ISO 字符串） |
| `is_archived` | INTEGER | NOT NULL, DEFAULT 0 | 归档标记：0=活跃，1=已归档 |
| `archived_at` | TEXT | - | 归档时间（ISO 字符串），未归档时为 NULL |

**唯一索引**：`(provider, provider_session_id)` — 保证同一 CLI 来源下原生会话 ID 不重复。

**两阶段排重**（`reconcileDiscovered`）：
1. 先查 `(provider, provider_session_id)` 是否存在 → 存在则 upsert
2. 不存在则查 `(provider, project_id, cwd)` 下无 `session_file_path` 的本地生成会话 → 匹配到则更新其 `provider_session_id` 指向发现的真实文件
3. 都没匹配到则新插入

### `token_usage_runs` — Token 统计运行段

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | 运行段 ID |
| `project_id` | TEXT | NOT NULL, FK → projects.id | 所属项目 |
| `session_id` | TEXT | NOT NULL, FK → sessions.id | 应用内 session 行 ID |
| `provider` | TEXT | NOT NULL | CLI 来源（claude/codex/gemini） |
| `provider_session_id` | TEXT | NOT NULL | CLI 原生会话 ID；本地生成 ID 被发现真实会话后需要同步迁移 |
| `profile_id` | TEXT | NOT NULL, DEFAULT '' | 启动时命中的 provider profile ID |
| `profile_name` | TEXT | NOT NULL, DEFAULT '' | 启动时命中的 provider profile 名称 |
| `model_name` | TEXT | NOT NULL, DEFAULT '' | 启动时解析出的模型名 |
| `api_base_host` | TEXT | NOT NULL, DEFAULT '' | 启动时解析出的 API base host，不保存完整 URL secret |
| `env_fingerprint` | TEXT | NOT NULL, DEFAULT '' | 启动环境指纹，只由非 secret 的归一化值生成 |
| `session_file_path` | TEXT | NOT NULL, DEFAULT '' | 已登记会话文件路径 |
| `run_started_at` | TEXT | NOT NULL | 运行段开始时间 |
| `run_ended_at` | TEXT | - | 运行段结束时间，运行中为 NULL |
| `created_at` | TEXT | NOT NULL | 创建时间 |
| `updated_at` | TEXT | NOT NULL | 最后更新时间 |

**索引**：
- `idx_token_usage_runs_session(provider, provider_session_id, run_started_at)`
- `idx_token_usage_runs_project(project_id, run_started_at)`
- `idx_token_usage_runs_model(provider, model_name, api_base_host)`

### `token_usage_snapshots` — Token 统计快照

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `run_id` | TEXT | PK, FK → token_usage_runs.id | 所属运行段 |
| `file_mtime_ms` | INTEGER | NOT NULL, DEFAULT 0 | 会话文件 mtime，用于跳过未变化文件 |
| `file_size` | INTEGER | NOT NULL, DEFAULT 0 | 会话文件大小，用于跳过未变化文件 |
| `stats_ended_at` | TEXT | - | 统计数据对应的最后消息时间 |
| `input_tokens` | INTEGER | NOT NULL, DEFAULT 0 | 输入 token 增量累计 |
| `output_tokens` | INTEGER | NOT NULL, DEFAULT 0 | 输出 token 增量累计 |
| `cached_tokens` | INTEGER | NOT NULL, DEFAULT 0 | 缓存 token 增量累计 |
| `reasoning_tokens` | INTEGER | NOT NULL, DEFAULT 0 | 推理 token 增量累计 |
| `tool_tokens` | INTEGER | NOT NULL, DEFAULT 0 | 工具调用 token 增量累计 |
| `total_tokens` | INTEGER | NOT NULL, DEFAULT 0 | 总 token 增量累计 |
| `rounds` | INTEGER | NOT NULL, DEFAULT 0 | 对话轮数增量累计 |
| `source_missing` | INTEGER | NOT NULL, DEFAULT 0 | 会话源文件是否缺失 |
| `last_error` | TEXT | NOT NULL, DEFAULT '' | 最近一次解析错误 |
| `updated_at` | TEXT | NOT NULL | 最后更新时间 |

**写入语义**：
- `token_usage_snapshots.run_id` 一行对应一个运行段，重复写入通过 `ON CONFLICT(run_id)` 累加 token/rounds。
- 文件指纹使用 `${file_mtime_ms}:${file_size}`，无 snapshot 或无效值返回空字符串。
- `sessions.reconcileDiscovered()` 把本地生成 `provider_session_id` 更新为真实 CLI 会话 ID 后，token usage run 必须同步迁移到真实 ID，避免 profile/model 归属退化为 `unknown`。

### `app_settings` — 应用设置键值

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `key` | TEXT | PK | 设置项键名 |
| `value` | TEXT | NOT NULL | 设置项值（JSON 字符串） |
| `updated_at` | TEXT | NOT NULL | 最后更新时间（ISO 字符串） |

目前只有一条记录 `provider_startup_settings`，存储 claude/codex/gemini 三方的 profile 配置。

### 表关系总结

- **`projects.id` ← `sessions.project_id`**：一个项目下可有多个会话。删除项目时级联删除其下所有会话。
- **`projects.id` ← `token_usage_runs.project_id`**：一个项目下可有多个 token 统计运行段。
- **`sessions.id` ← `token_usage_runs.session_id`**：一个应用会话可产生多个运行段（例如切换 provider/profile/model 后重新启动）。
- **`token_usage_runs.id` ← `token_usage_snapshots.run_id`**：一个运行段最多一个累计快照。
- **`app_settings`**：独立键值表，无外键关系。

## Repository 层

每个 repo 通过工厂函数创建，接收依赖注入（`getDatabase`, `now`, `genId`）：

| Repo | 文件 | 主要操作 |
| --- | --- | --- |
| `projectsRepo` | `repositories/project.repository.js` | `list()`, `getById()`, `create()`, `remove()` |
| `sessionsRepo` | `repositories/session.repository.js` | `listAllActive()`, `listByProject()`, `getById()`, `create()`, `upsertDiscovered()`, `reconcileDiscovered()`, `archive/restore`, `reorderActiveByProject()`, `markAllStopped()` |
| `settingsRepo` | `repositories/settings.repository.js` | `getProviderStartupSettings()`, `setProviderStartupSettings()` |
| `archiveRepo` | `repositories/archive.repository.js` | `listAll()`, `archiveByProviderSessionId()`, `restoreByProviderSessionId()` |
| `tokenUsageRepo` | `repositories/token-usage.repository.js` | `startRun()`, `finishRun()`, `addSnapshotDelta()`, `getSummary()`, `getAssignedTotals()`, `getLastFingerprint()`, `reconcileProviderSessionId()` |

**关键操作说明**：
- `projectsRepo.remove(projectId)` 会先删除关联 sessions 再删除 project。
- `sessionsRepo.reorderActiveByProject()` 以传入的有序列表为准，未列出的 session 保持原有顺序追加。
- `sessionsRepo.upsertDiscovered()` 使用 `ON CONFLICT(provider, provider_session_id)` 做 upsert。
- `tokenUsageRepo.reconcileProviderSessionId()` 在发现真实 CLI 会话 ID 后迁移运行段归属，不改动 snapshot 数据。
- `sessionsRepo.markAllStopped()` 应用启动时将所有 `status='running'` 的 session 标记为 `exited`。
- `settingsRepo.ensureProviderShape()` 对 provider 配置做归一化：填充缺失字段、清理无效引用、兼容旧格式迁移。

## 迁移层 (`migrations/`)

### `legacy-columns.js`
向后兼容迁移：使用 `PRAGMA table_info` 检查列是否存在，不存在则 `ALTER TABLE ADD COLUMN`。目前管理的遗留列：`is_archived`, `archived_at`, `provider_session_id`, `cwd`, `session_file_path`, `sort_order`。

### `session-indexes.js`
- 修复 `provider_session_id` 空值 → 回填为 `id`
- 清理 `(provider, provider_session_id)` 重复行（保留更新时间最新的）
- 创建唯一索引 `idx_sessions_provider_sid_unique`
- 为 `sort_order = 0` 的旧行按 `created_at` 降序初始化排序值

### `token-usage-tables.js`
- 创建 `token_usage_runs` 和 `token_usage_snapshots`。
- 创建 token usage 聚合查询所需索引。
- 运行时由 `connection.js` 的 `initDatabase()` 显式调用，保证旧数据库也能补齐新表。

**新增迁移**：在 `migrations/` 下新建文件，在 `connection.js` 的 `initDatabase()` 中调用。

## 不涉及的职责

- **不定义 IPC channel** — channel 定义属于对应 block 的 `shared/`。
- **不写业务编排** — 业务逻辑在 `src/pages/` 的 store 或 service 中，repo 只做数据访问。
- **不直接操作文件系统** — 会话文件（jsonl/json）的读写不在此层。
