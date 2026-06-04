# Token Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Settings 中新增 Token 统计页面，按项目、provider、模型和运行段统计当前数据库已登记会话的 token 消耗。

**Architecture:** 新增 `settings/token-usage` Page Block Capsule，renderer 只通过本 block bridge 访问 preload API，main 通过注入的 token usage sync service 查询 SQLite 缓存。统计归属以“运行段”为单位，主进程在会话创建/恢复时记录 provider profile、model、base host 和 env fingerprint，刷新时从已登记 `sessions.session_file_path` 解析累计 token 并把增量归属到当前运行段。

**Tech Stack:** Electron IPC、React 18、TypeScript/JS、better-sqlite3、node:test、Playwright E2E、现有 `session-stats.service.js` provider-specific parser。

---

## File Structure

Create:

- `src/kernel/db/migrations/token-usage-tables.js`：确保 token usage 表和索引存在。
- `src/kernel/db/migrations/token-usage-tables.test.js`：验证表结构、索引、幂等迁移。
- `src/kernel/db/repositories/token-usage.repository.js`：运行段和快照的数据访问层。
- `src/kernel/db/repositories/token-usage.repository.test.js`：验证运行段创建、增量写入、聚合查询。
- `src/pages/settings/token-usage/README.md`：block 职责说明。
- `src/pages/settings/token-usage/block.main.js`：注册 token usage IPC。
- `src/pages/settings/token-usage/block.preload.js`：合并 preload API。
- `src/pages/settings/token-usage/block.renderer.tsx`：导出 Settings section。
- `src/pages/settings/token-usage/main/token-run-metadata.service.js`：从 active provider profile/env 生成运行段元数据。
- `src/pages/settings/token-usage/main/token-run-metadata.service.test.js`：验证模型名、base host、fingerprint。
- `src/pages/settings/token-usage/main/token-usage-sync.service.js`：增量扫描和运行段归属。
- `src/pages/settings/token-usage/main/token-usage-sync.service.test.js`：验证不重复累计、跨模型分段、缺失文件。
- `src/pages/settings/token-usage/preload/token-usage.api.js`：renderer 可调用 API。
- `src/pages/settings/token-usage/renderer/token-usage.bridge.ts`：renderer 私有 bridge 和类型。
- `src/pages/settings/token-usage/renderer/use-token-usage.js`：页面数据加载、刷新、筛选状态。
- `src/pages/settings/token-usage/renderer/TokenUsageSettingsSection.jsx`：已确认 UI 布局的实现。
- `src/pages/settings/token-usage/shared/token-usage.channels.js`：IPC channel。
- `src/pages/settings/token-usage/shared/token-usage.types.ts`：共享类型。
- `src/pages/settings/token-usage/e2e/token-usage.e2e.js`：Settings Token 统计 E2E。

Modify:

- `src/kernel/db/schema.js`：注册 `token_usage_runs`、`token_usage_snapshots` 模型。
- `src/kernel/db/connection.js`：执行 token usage 迁移，导出 `tokenUsageRepo(conn)`。
- `src/pages/settings/settings.main.js`：导出 token usage service factory。
- `src/app/main.js`：创建 token usage repo/runtime，传给 page main；在 PTY exit 时结束运行段。
- `src/app/register-page-main.js`：注册 token-usage main。
- `src/app/register-page-preload.js`：合并 token-usage preload API。
- `src/app/register-page-renderer.tsx`：注册 token-usage renderer。
- `src/app/ipc-schemas.js`：新增 token usage summary/refresh schema。
- `src/app/env.d.ts`：补充 `window.electronAPI.tokenUsage` 类型。
- `src/pages/home/terminal/block.main.js`：在 create/start 成功启动 PTY 时记录运行段。
- `src/pages/settings/SettingsPage.tsx`：Settings standalone 页面增加 `token-usage` section。
- `src/pages/settings/providers/renderer/SettingsModal.jsx`：Settings modal 增加 `token-usage` section。
- `src/pages/settings/providers/renderer/SettingsSideNav.jsx`：Settings nav 增加 `Token 统计`。
- `src/pages/settings/providers/main/provider-settings-runtime.js`：让 `getActiveProviderProfile()` 返回 `profileName`。

Do not modify:

- 不把 token usage bridge 放入 `src/shared/bridge`。
- 不让 `settings/token-usage/renderer` import Node.js、main、preload。
- 不让 Settings block 直接 import terminal renderer 或 terminal bridge。
- 不扫描未登记到 SQLite `sessions` 表的 CLI 历史文件。

---

### Task 1: DB Schema, Migration, Repository

**Files:**

- Create: `src/kernel/db/migrations/token-usage-tables.js`
- Create: `src/kernel/db/migrations/token-usage-tables.test.js`
- Create: `src/kernel/db/repositories/token-usage.repository.js`
- Create: `src/kernel/db/repositories/token-usage.repository.test.js`
- Modify: `src/kernel/db/schema.js`
- Modify: `src/kernel/db/connection.js`

- [ ] **Step 1: Write failing migration test**

Create `src/kernel/db/migrations/token-usage-tables.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { ensureTokenUsageTables } = require('./token-usage-tables');

test('ensureTokenUsageTables creates run and snapshot tables idempotently', () => {
  const conn = new Database(':memory:');

  ensureTokenUsageTables(conn);
  ensureTokenUsageTables(conn);

  const tables = conn
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.ok(tables.includes('token_usage_runs'));
  assert.ok(tables.includes('token_usage_snapshots'));

  const runColumns = conn
    .prepare('PRAGMA table_info(token_usage_runs)')
    .all()
    .map((row) => row.name);
  assert.deepEqual(runColumns, [
    'id',
    'project_id',
    'session_id',
    'provider',
    'provider_session_id',
    'profile_id',
    'profile_name',
    'model_name',
    'api_base_host',
    'env_fingerprint',
    'session_file_path',
    'run_started_at',
    'run_ended_at',
    'created_at',
    'updated_at',
  ]);

  const snapshotColumns = conn
    .prepare('PRAGMA table_info(token_usage_snapshots)')
    .all()
    .map((row) => row.name);
  assert.deepEqual(snapshotColumns, [
    'run_id',
    'file_mtime_ms',
    'file_size',
    'stats_ended_at',
    'input_tokens',
    'output_tokens',
    'cached_tokens',
    'reasoning_tokens',
    'tool_tokens',
    'total_tokens',
    'rounds',
    'source_missing',
    'last_error',
    'updated_at',
  ]);

  const indexes = conn
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.ok(indexes.includes('idx_token_usage_runs_session'));
  assert.ok(indexes.includes('idx_token_usage_runs_project'));
  assert.ok(indexes.includes('idx_token_usage_runs_model'));
});
```

- [ ] **Step 2: Run migration test and verify it fails**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/kernel/db/migrations/token-usage-tables.test.js
```

Expected: FAIL with `Cannot find module './token-usage-tables'`.

- [ ] **Step 3: Implement token usage migration**

Create `src/kernel/db/migrations/token-usage-tables.js`:

```js
function ensureTokenUsageTables(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS token_usage_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      profile_id TEXT NOT NULL DEFAULT '',
      profile_name TEXT NOT NULL DEFAULT '',
      model_name TEXT NOT NULL DEFAULT '',
      api_base_host TEXT NOT NULL DEFAULT '',
      env_fingerprint TEXT NOT NULL DEFAULT '',
      session_file_path TEXT NOT NULL DEFAULT '',
      run_started_at TEXT NOT NULL,
      run_ended_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_usage_snapshots (
      run_id TEXT PRIMARY KEY,
      file_mtime_ms INTEGER NOT NULL DEFAULT 0,
      file_size INTEGER NOT NULL DEFAULT 0,
      stats_ended_at TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      tool_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      rounds INTEGER NOT NULL DEFAULT 0,
      source_missing INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES token_usage_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_runs_session
      ON token_usage_runs(provider, provider_session_id, run_started_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_runs_project
      ON token_usage_runs(project_id, run_started_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_runs_model
      ON token_usage_runs(provider, model_name, api_base_host);
  `);
}

module.exports = { ensureTokenUsageTables };
```

- [ ] **Step 4: Register schema models**

Modify `src/kernel/db/schema.js` by adding `tokenUsageRuns` and `tokenUsageSnapshots` entries to `DB_MODELS`. Use the same columns and indexes as the migration. Keep the migration as the runtime guard because it is explicit and testable.

- [ ] **Step 5: Wire migration into connection**

Modify `src/kernel/db/connection.js`:

```js
const { ensureTokenUsageTables } = require('./migrations/token-usage-tables');
const { createTokenUsageRepo } = require('./repositories/token-usage.repository');
```

Inside `initDatabase()` after session migrations:

```js
ensureTokenUsageTables(db);
```

Add factory:

```js
function tokenUsageRepo(conn) {
  return createTokenUsageRepo({
    getDatabase: () => resolveConn(conn),
    now,
    genId,
  });
}
```

Export it:

```js
tokenUsageRepo,
```

- [ ] **Step 6: Write failing repository tests**

Create `src/kernel/db/repositories/token-usage.repository.test.js` with these tests:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { ensureTokenUsageTables } = require('../migrations/token-usage-tables');
const { createTokenUsageRepo } = require('./token-usage.repository');

function createRepo() {
  const conn = new Database(':memory:');
  ensureTokenUsageTables(conn);
  let seq = 0;
  const repo = createTokenUsageRepo({
    getDatabase: () => conn,
    now: () => '2026-06-04T00:00:00.000Z',
    genId: () => `run-${++seq}`,
  });
  return { conn, repo };
}

test('startRun creates a running model snapshot', () => {
  const { repo } = createRepo();
  const run = repo.startRun({
    projectId: 'p1',
    sessionId: 's1',
    provider: 'claude',
    providerSessionId: 'claude-sid',
    profileId: 'kimi',
    profileName: 'Kimi',
    modelName: 'kimi-for-coding',
    apiBaseHost: 'api.moonshot.cn',
    envFingerprint: 'abc',
    sessionFilePath: '/tmp/a.jsonl',
    startedAt: '2026-06-04T01:00:00.000Z',
  });

  assert.equal(run.id, 'run-1');
  assert.equal(run.model_name, 'kimi-for-coding');
  assert.equal(run.run_ended_at, null);
});

test('addSnapshotDelta accumulates per run without overwriting prior model runs', () => {
  const { repo } = createRepo();
  const run1 = repo.startRun({
    projectId: 'p1',
    sessionId: 's1',
    provider: 'claude',
    providerSessionId: 'sid',
    profileId: 'kimi',
    profileName: 'Kimi',
    modelName: 'kimi-for-coding',
    apiBaseHost: 'api.moonshot.cn',
    envFingerprint: 'kimi-hash',
    sessionFilePath: '/tmp/a.jsonl',
    startedAt: '2026-06-04T01:00:00.000Z',
  });
  repo.addSnapshotDelta(run1.id, {
    fileMtimeMs: 100,
    fileSize: 200,
    statsEndedAt: '2026-06-04T01:03:00.000Z',
    inputTokens: 10,
    outputTokens: 5,
    cachedTokens: 2,
    reasoningTokens: 1,
    toolTokens: 0,
    totalTokens: 15,
    rounds: 2,
  });
  repo.finishRun(run1.id, '2026-06-04T01:05:00.000Z');

  const run2 = repo.startRun({
    projectId: 'p1',
    sessionId: 's1',
    provider: 'claude',
    providerSessionId: 'sid',
    profileId: 'deepseek',
    profileName: 'DeepSeek',
    modelName: 'deepseek-v4-pro',
    apiBaseHost: 'api.deepseek.com',
    envFingerprint: 'deepseek-hash',
    sessionFilePath: '/tmp/a.jsonl',
    startedAt: '2026-06-04T02:00:00.000Z',
  });
  repo.addSnapshotDelta(run2.id, {
    fileMtimeMs: 300,
    fileSize: 500,
    statsEndedAt: '2026-06-04T02:03:00.000Z',
    inputTokens: 20,
    outputTokens: 8,
    cachedTokens: 0,
    reasoningTokens: 2,
    toolTokens: 1,
    totalTokens: 28,
    rounds: 3,
  });

  const byModel = repo.getSummary({ range: 'all' }).models;
  assert.deepEqual(byModel.map((row) => [row.provider, row.modelName, row.totalTokens]), [
    ['claude', 'deepseek-v4-pro', 28],
    ['claude', 'kimi-for-coding', 15],
  ]);
});

test('getAssignedTotals sums all prior runs for a provider session', () => {
  const { repo } = createRepo();
  const run = repo.startRun({
    projectId: 'p1',
    sessionId: 's1',
    provider: 'claude',
    providerSessionId: 'sid',
    profileId: '',
    profileName: '',
    modelName: 'unknown',
    apiBaseHost: '',
    envFingerprint: '',
    sessionFilePath: '/tmp/a.jsonl',
    startedAt: '2026-06-04T01:00:00.000Z',
  });
  repo.addSnapshotDelta(run.id, {
    fileMtimeMs: 100,
    fileSize: 100,
    statsEndedAt: '2026-06-04T01:01:00.000Z',
    inputTokens: 7,
    outputTokens: 3,
    cachedTokens: 0,
    reasoningTokens: 0,
    toolTokens: 0,
    totalTokens: 10,
    rounds: 1,
  });

  assert.deepEqual(repo.getAssignedTotals({ provider: 'claude', providerSessionId: 'sid' }), {
    inputTokens: 7,
    outputTokens: 3,
    cachedTokens: 0,
    reasoningTokens: 0,
    toolTokens: 0,
    totalTokens: 10,
    rounds: 1,
  });
});
```

- [ ] **Step 7: Run repository tests and verify they fail**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/kernel/db/repositories/token-usage.repository.test.js
```

Expected: FAIL with `Cannot find module './token-usage.repository'`.

- [ ] **Step 8: Implement repository**

Create `src/kernel/db/repositories/token-usage.repository.js` with these public methods:

```js
function createTokenUsageRepo({ getDatabase, now, genId }) {
  const conn = getDatabase();

  function normalizeTokenNumber(value) {
    return Math.max(0, Math.floor(Number(value || 0)));
  }

  function toRunView(row) {
    return row
      ? {
          id: row.id,
          project_id: row.project_id,
          session_id: row.session_id,
          provider: row.provider,
          provider_session_id: row.provider_session_id,
          profile_id: row.profile_id,
          profile_name: row.profile_name,
          model_name: row.model_name,
          api_base_host: row.api_base_host,
          env_fingerprint: row.env_fingerprint,
          session_file_path: row.session_file_path,
          run_started_at: row.run_started_at,
          run_ended_at: row.run_ended_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      : null;
  }

  function buildRangeWhere(range) {
    if (range === '7d') return " AND COALESCE(ts.stats_ended_at, r.run_ended_at, r.updated_at) >= datetime('now', '-7 days')";
    if (range === '30d') return " AND COALESCE(ts.stats_ended_at, r.run_ended_at, r.updated_at) >= datetime('now', '-30 days')";
    return '';
  }

  return {
    startRun(payload) {
      const timestamp = now();
      const row = {
        id: genId(),
        project_id: String(payload.projectId || ''),
        session_id: String(payload.sessionId || ''),
        provider: String(payload.provider || 'claude').toLowerCase(),
        provider_session_id: String(payload.providerSessionId || ''),
        profile_id: String(payload.profileId || ''),
        profile_name: String(payload.profileName || ''),
        model_name: String(payload.modelName || 'unknown'),
        api_base_host: String(payload.apiBaseHost || ''),
        env_fingerprint: String(payload.envFingerprint || ''),
        session_file_path: String(payload.sessionFilePath || ''),
        run_started_at: String(payload.startedAt || timestamp),
        run_ended_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      conn
        .prepare(
          `INSERT INTO token_usage_runs (
            id, project_id, session_id, provider, provider_session_id,
            profile_id, profile_name, model_name, api_base_host, env_fingerprint,
            session_file_path, run_started_at, run_ended_at, created_at, updated_at
          ) VALUES (
            @id, @project_id, @session_id, @provider, @provider_session_id,
            @profile_id, @profile_name, @model_name, @api_base_host, @env_fingerprint,
            @session_file_path, @run_started_at, @run_ended_at, @created_at, @updated_at
          )`,
        )
        .run(row);
      return toRunView(row);
    },

    getActiveRunByProviderSession({ provider, providerSessionId }) {
      const row = conn
        .prepare(
          `SELECT * FROM token_usage_runs
           WHERE provider = ? AND provider_session_id = ? AND run_ended_at IS NULL
           ORDER BY run_started_at DESC, created_at DESC LIMIT 1`,
        )
        .get(String(provider || 'claude').toLowerCase(), String(providerSessionId || ''));
      return toRunView(row);
    },

    getLatestRunByProviderSession({ provider, providerSessionId }) {
      const row = conn
        .prepare(
          `SELECT * FROM token_usage_runs
           WHERE provider = ? AND provider_session_id = ?
           ORDER BY run_started_at DESC, created_at DESC LIMIT 1`,
        )
        .get(String(provider || 'claude').toLowerCase(), String(providerSessionId || ''));
      return toRunView(row);
    },

    finishRun(runId, endedAt = now()) {
      conn
        .prepare('UPDATE token_usage_runs SET run_ended_at = ?, updated_at = ? WHERE id = ?')
        .run(endedAt, now(), runId);
    },

    addSnapshotDelta(runId, delta) {
      const timestamp = now();
      const row = {
        run_id: String(runId || ''),
        file_mtime_ms: normalizeTokenNumber(delta.fileMtimeMs),
        file_size: normalizeTokenNumber(delta.fileSize),
        stats_ended_at: delta.statsEndedAt || null,
        input_tokens: normalizeTokenNumber(delta.inputTokens),
        output_tokens: normalizeTokenNumber(delta.outputTokens),
        cached_tokens: normalizeTokenNumber(delta.cachedTokens),
        reasoning_tokens: normalizeTokenNumber(delta.reasoningTokens),
        tool_tokens: normalizeTokenNumber(delta.toolTokens),
        total_tokens: normalizeTokenNumber(delta.totalTokens),
        rounds: normalizeTokenNumber(delta.rounds),
        source_missing: delta.sourceMissing ? 1 : 0,
        last_error: String(delta.lastError || ''),
        updated_at: timestamp,
      };
      conn
        .prepare(
          `INSERT INTO token_usage_snapshots (
            run_id, file_mtime_ms, file_size, stats_ended_at,
            input_tokens, output_tokens, cached_tokens, reasoning_tokens,
            tool_tokens, total_tokens, rounds, source_missing, last_error, updated_at
          ) VALUES (
            @run_id, @file_mtime_ms, @file_size, @stats_ended_at,
            @input_tokens, @output_tokens, @cached_tokens, @reasoning_tokens,
            @tool_tokens, @total_tokens, @rounds, @source_missing, @last_error, @updated_at
          )
          ON CONFLICT(run_id) DO UPDATE SET
            file_mtime_ms = excluded.file_mtime_ms,
            file_size = excluded.file_size,
            stats_ended_at = excluded.stats_ended_at,
            input_tokens = token_usage_snapshots.input_tokens + excluded.input_tokens,
            output_tokens = token_usage_snapshots.output_tokens + excluded.output_tokens,
            cached_tokens = token_usage_snapshots.cached_tokens + excluded.cached_tokens,
            reasoning_tokens = token_usage_snapshots.reasoning_tokens + excluded.reasoning_tokens,
            tool_tokens = token_usage_snapshots.tool_tokens + excluded.tool_tokens,
            total_tokens = token_usage_snapshots.total_tokens + excluded.total_tokens,
            rounds = token_usage_snapshots.rounds + excluded.rounds,
            source_missing = excluded.source_missing,
            last_error = excluded.last_error,
            updated_at = excluded.updated_at`,
        )
        .run(row);
    },

    getAssignedTotals({ provider, providerSessionId }) {
      const row = conn
        .prepare(
          `SELECT
             COALESCE(SUM(ts.input_tokens), 0) AS inputTokens,
             COALESCE(SUM(ts.output_tokens), 0) AS outputTokens,
             COALESCE(SUM(ts.cached_tokens), 0) AS cachedTokens,
             COALESCE(SUM(ts.reasoning_tokens), 0) AS reasoningTokens,
             COALESCE(SUM(ts.tool_tokens), 0) AS toolTokens,
             COALESCE(SUM(ts.total_tokens), 0) AS totalTokens,
             COALESCE(SUM(ts.rounds), 0) AS rounds
           FROM token_usage_runs r
           LEFT JOIN token_usage_snapshots ts ON ts.run_id = r.id
           WHERE r.provider = ? AND r.provider_session_id = ?`,
        )
        .get(String(provider || 'claude').toLowerCase(), String(providerSessionId || ''));
      return {
        inputTokens: normalizeTokenNumber(row.inputTokens),
        outputTokens: normalizeTokenNumber(row.outputTokens),
        cachedTokens: normalizeTokenNumber(row.cachedTokens),
        reasoningTokens: normalizeTokenNumber(row.reasoningTokens),
        toolTokens: normalizeTokenNumber(row.toolTokens),
        totalTokens: normalizeTokenNumber(row.totalTokens),
        rounds: normalizeTokenNumber(row.rounds),
      };
    },

    getLastFingerprint({ provider, providerSessionId }) {
      return (
        conn
          .prepare(
            `SELECT ts.file_mtime_ms AS fileMtimeMs, ts.file_size AS fileSize
             FROM token_usage_runs r
             JOIN token_usage_snapshots ts ON ts.run_id = r.id
             WHERE r.provider = ? AND r.provider_session_id = ?
             ORDER BY ts.updated_at DESC LIMIT 1`,
          )
          .get(String(provider || 'claude').toLowerCase(), String(providerSessionId || '')) || null
      );
    },

    getSummary(filters = {}) {
      const rangeWhere = buildRangeWhere(filters.range || '30d');
      const params = [];
      let where = `WHERE 1 = 1${rangeWhere}`;
      if (filters.projectId) {
        where += ' AND r.project_id = ?';
        params.push(filters.projectId);
      }
      if (filters.provider) {
        where += ' AND r.provider = ?';
        params.push(filters.provider);
      }
      if (filters.modelName) {
        where += ' AND r.model_name = ?';
        params.push(filters.modelName);
      }
      const totals =
        conn
          .prepare(
            `SELECT
               COALESCE(SUM(ts.input_tokens), 0) AS inputTokens,
               COALESCE(SUM(ts.output_tokens), 0) AS outputTokens,
               COALESCE(SUM(ts.cached_tokens), 0) AS cachedTokens,
               COALESCE(SUM(ts.reasoning_tokens), 0) AS reasoningTokens,
               COALESCE(SUM(ts.tool_tokens), 0) AS toolTokens,
               COALESCE(SUM(ts.total_tokens), 0) AS totalTokens,
               COALESCE(SUM(ts.rounds), 0) AS rounds,
               COUNT(DISTINCT r.session_id) AS sessionCount,
               COUNT(DISTINCT r.id) AS runCount
             FROM token_usage_runs r
             LEFT JOIN token_usage_snapshots ts ON ts.run_id = r.id
             ${where}`,
          )
          .get(...params) || {};
      const models = conn
        .prepare(
          `SELECT
             r.provider AS provider,
             r.model_name AS modelName,
             r.profile_name AS profileName,
             r.api_base_host AS apiBaseHost,
             COUNT(DISTINCT r.id) AS runCount,
             COALESCE(SUM(ts.total_tokens), 0) AS totalTokens
           FROM token_usage_runs r
           LEFT JOIN token_usage_snapshots ts ON ts.run_id = r.id
           ${where}
           GROUP BY r.provider, r.model_name, r.profile_name, r.api_base_host
           ORDER BY totalTokens DESC`,
        )
        .all(...params);
      return { totals, models };
    },
  };
}

module.exports = { createTokenUsageRepo };
```

- [ ] **Step 9: Run DB tests**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/kernel/db/migrations/token-usage-tables.test.js src/kernel/db/repositories/token-usage.repository.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit DB layer**

```bash
git add src/kernel/db/schema.js src/kernel/db/connection.js src/kernel/db/migrations/token-usage-tables.js src/kernel/db/migrations/token-usage-tables.test.js src/kernel/db/repositories/token-usage.repository.js src/kernel/db/repositories/token-usage.repository.test.js
git commit -m "feat: add token usage persistence"
```

---

### Task 2: Provider Run Metadata

**Files:**

- Create: `src/pages/settings/token-usage/main/token-run-metadata.service.js`
- Create: `src/pages/settings/token-usage/main/token-run-metadata.service.test.js`
- Modify: `src/pages/settings/providers/main/provider-settings-runtime.js`

- [ ] **Step 1: Write failing metadata tests**

Create `src/pages/settings/token-usage/main/token-run-metadata.service.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveModelName,
  resolveApiBaseHost,
  fingerprintEnv,
  createTokenRunMetadataResolver,
} = require('./token-run-metadata.service');

test('resolveModelName uses provider-specific model keys before generic MODEL', () => {
  assert.equal(resolveModelName('claude', { ANTHROPIC_MODEL: 'kimi-for-coding', MODEL: 'fallback' }), 'kimi-for-coding');
  assert.equal(resolveModelName('codex', { OPENAI_MODEL: 'gpt-5.2', MODEL: 'fallback' }), 'gpt-5.2');
  assert.equal(resolveModelName('gemini', { GEMINI_MODEL: 'gemini-2.5-pro', MODEL: 'fallback' }), 'gemini-2.5-pro');
  assert.equal(resolveModelName('claude', { MODEL: 'shared-model' }), 'shared-model');
  assert.equal(resolveModelName('claude', {}), 'unknown');
});

test('resolveApiBaseHost stores only host and optional first path segment for compatible gateways', () => {
  assert.equal(resolveApiBaseHost({ ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic/v1' }), 'api.deepseek.com/anthropic');
  assert.equal(resolveApiBaseHost({ OPENAI_BASE_URL: 'https://api.openai.com/v1' }), 'api.openai.com');
  assert.equal(resolveApiBaseHost({ GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com' }), 'generativelanguage.googleapis.com');
  assert.equal(resolveApiBaseHost({}), '');
});

test('fingerprintEnv ignores secrets and is stable by sorted key order', () => {
  const left = fingerprintEnv({
    ANTHROPIC_AUTH_TOKEN: 'secret-a',
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    ANTHROPIC_MODEL: 'deepseek-v4-pro',
  });
  const right = fingerprintEnv({
    ANTHROPIC_MODEL: 'deepseek-v4-pro',
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    ANTHROPIC_AUTH_TOKEN: 'secret-b',
  });
  assert.equal(left, right);
});

test('metadata resolver combines active profile and startup env', () => {
  const resolve = createTokenRunMetadataResolver({
    normalizeProviderId: (value) => String(value || 'claude').toLowerCase(),
    getActiveProviderProfile: () => ({
      providerId: 'claude',
      profileId: 'kimi',
      profileName: 'Kimi',
      envVars: [{ key: 'ANTHROPIC_MODEL', value: 'kimi-for-coding' }],
    }),
    getStartupEnvForProvider: () => ({
      ANTHROPIC_MODEL: 'kimi-for-coding',
      ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'secret',
    }),
  });

  assert.deepEqual(resolve('claude'), {
    provider: 'claude',
    profileId: 'kimi',
    profileName: 'Kimi',
    modelName: 'kimi-for-coding',
    apiBaseHost: 'api.moonshot.cn/anthropic',
    envFingerprint: fingerprintEnv({
      ANTHROPIC_MODEL: 'kimi-for-coding',
      ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'secret',
    }),
  });
});
```

- [ ] **Step 2: Run metadata tests and verify failure**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/pages/settings/token-usage/main/token-run-metadata.service.test.js
```

Expected: FAIL with `Cannot find module './token-run-metadata.service'`.

- [ ] **Step 3: Implement metadata resolver**

Create `src/pages/settings/token-usage/main/token-run-metadata.service.js`:

```js
const crypto = require('node:crypto');

const MODEL_KEYS_BY_PROVIDER = {
  claude: ['ANTHROPIC_MODEL', 'MODEL'],
  codex: ['OPENAI_MODEL', 'MODEL'],
  gemini: ['GEMINI_MODEL', 'MODEL'],
};

const BASE_URL_KEYS = [
  'ANTHROPIC_BASE_URL',
  'OPENAI_BASE_URL',
  'GEMINI_BASE_URL',
  'GOOGLE_GEMINI_BASE_URL',
  'BASE_URL',
];

const FINGERPRINT_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'GEMINI_BASE_URL',
  'GEMINI_MODEL',
  'GOOGLE_GEMINI_BASE_URL',
  'MODEL',
  'BASE_URL',
  'HTTP_PROXY',
  'HTTPS_PROXY',
];

function resolveModelName(provider, env = {}) {
  const keys = MODEL_KEYS_BY_PROVIDER[String(provider || 'claude').toLowerCase()] || ['MODEL'];
  for (const key of keys) {
    const value = String(env[key] || '').trim();
    if (value) return value;
  }
  return 'unknown';
}

function resolveApiBaseHost(env = {}) {
  for (const key of BASE_URL_KEYS) {
    const value = String(env[key] || '').trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const firstSegment = parsed.pathname.split('/').filter(Boolean)[0] || '';
      if (firstSegment && /anthropic|openai|gemini/i.test(firstSegment)) {
        return `${host}/${firstSegment.toLowerCase()}`;
      }
      return host;
    } catch {
      return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/').slice(0, 2).join('/');
    }
  }
  return '';
}

function fingerprintEnv(env = {}) {
  const payload = {};
  for (const key of FINGERPRINT_KEYS.sort()) {
    const value = String(env[key] || '').trim();
    if (value) payload[key] = value;
  }
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function createTokenRunMetadataResolver({
  normalizeProviderId,
  getActiveProviderProfile,
  getStartupEnvForProvider,
}) {
  return function resolveTokenRunMetadata(provider = 'claude') {
    const id = normalizeProviderId(provider);
    const activeProfile =
      typeof getActiveProviderProfile === 'function'
        ? getActiveProviderProfile(id)
        : { profileId: '', profileName: '', envVars: [] };
    const env =
      typeof getStartupEnvForProvider === 'function' ? getStartupEnvForProvider(id) : {};
    return {
      provider: id,
      profileId: String(activeProfile?.profileId || ''),
      profileName: String(activeProfile?.profileName || ''),
      modelName: resolveModelName(id, env),
      apiBaseHost: resolveApiBaseHost(env),
      envFingerprint: fingerprintEnv(env),
    };
  };
}

module.exports = {
  resolveModelName,
  resolveApiBaseHost,
  fingerprintEnv,
  createTokenRunMetadataResolver,
};
```

- [ ] **Step 4: Extend active profile runtime**

Modify `src/pages/settings/providers/main/provider-settings-runtime.js` inside `getActiveProviderProfile()` return value:

```js
return {
  providerId: id,
  profileId: profile.id || activeProfileId || '',
  profileName: profile.name || profile.id || activeProfileId || '',
  envVars: mergedEnvVars,
};
```

- [ ] **Step 5: Run metadata tests**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/pages/settings/token-usage/main/token-run-metadata.service.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit metadata service**

```bash
git add src/pages/settings/token-usage/main/token-run-metadata.service.js src/pages/settings/token-usage/main/token-run-metadata.service.test.js src/pages/settings/providers/main/provider-settings-runtime.js
git commit -m "feat: resolve token usage run metadata"
```

---

### Task 3: Token Usage Sync Service

**Files:**

- Create: `src/pages/settings/token-usage/main/token-usage-sync.service.js`
- Create: `src/pages/settings/token-usage/main/token-usage-sync.service.test.js`

- [ ] **Step 1: Write failing sync tests**

Create `src/pages/settings/token-usage/main/token-usage-sync.service.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTokenUsageSyncService } = require('./token-usage-sync.service');

function createDeps(overrides = {}) {
  const rows = overrides.rows || [
    {
      id: 's1',
      project_id: 'p1',
      provider: 'claude',
      provider_session_id: 'sid',
      session_file_path: '/tmp/a.jsonl',
      updated_at: '2026-06-04T01:00:00.000Z',
    },
  ];
  const calls = {
    started: [],
    deltas: [],
    finished: [],
  };
  const activeRuns = new Map();
  let runSeq = 0;
  const tokenUsageStore = {
    startRun(payload) {
      const run = { id: `run-${++runSeq}`, ...payload };
      activeRuns.set(`${payload.provider}:${payload.providerSessionId}`, run);
      calls.started.push(run);
      return run;
    },
    getActiveRunByProviderSession({ provider, providerSessionId }) {
      return activeRuns.get(`${provider}:${providerSessionId}`) || null;
    },
    getLatestRunByProviderSession() {
      return null;
    },
    getAssignedTotals: overrides.getAssignedTotals || (() => ({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      toolTokens: 0,
      totalTokens: 0,
      rounds: 0,
    })),
    getLastFingerprint: overrides.getLastFingerprint || (() => null),
    addSnapshotDelta(runId, delta) {
      calls.deltas.push({ runId, delta });
    },
    finishRun(runId, endedAt) {
      calls.finished.push({ runId, endedAt });
    },
  };
  return {
    calls,
    service: createTokenUsageSyncService({
      fs: {
        existsSync: overrides.existsSync || (() => true),
        statSync: overrides.statSync || (() => ({ mtimeMs: 200, size: 300 })),
      },
      sessionStore: {
        listAllActive: () => rows.filter((row) => !row.is_archived),
        listAllArchived: () => rows.filter((row) => row.is_archived),
        getByProviderSessionId: ({ provider, providerSessionId }) =>
          rows.find((row) => row.provider === provider && row.provider_session_id === providerSessionId),
      },
      tokenUsageStore,
      readSessionStats: overrides.readSessionStats || (() => ({
        endedAt: Date.parse('2026-06-04T01:02:00.000Z'),
        rounds: 3,
        tokens: {
          input: 100,
          output: 40,
          cached: 10,
          reasoning: 5,
          tool: 2,
          total: 140,
          available: true,
        },
      })),
      resolveRunMetadata: overrides.resolveRunMetadata || (() => ({
        provider: 'claude',
        profileId: 'kimi',
        profileName: 'Kimi',
        modelName: 'kimi-for-coding',
        apiBaseHost: 'api.moonshot.cn',
        envFingerprint: 'hash-kimi',
      })),
      now: () => '2026-06-04T01:03:00.000Z',
      logWarn: () => {},
    }),
  };
}

test('refresh creates unknown run when no active run exists and writes cumulative delta', async () => {
  const { service, calls } = createDeps();
  const result = await service.refresh({ force: true });

  assert.equal(result.scanned, 1);
  assert.equal(calls.started[0].modelName, 'unknown');
  assert.equal(calls.deltas[0].delta.totalTokens, 140);
  assert.equal(calls.deltas[0].delta.rounds, 3);
});

test('refresh skips unchanged file fingerprint', async () => {
  const { service, calls } = createDeps({
    getLastFingerprint: () => ({ fileMtimeMs: 200, fileSize: 300 }),
  });
  const result = await service.refresh({ force: false });

  assert.equal(result.scanned, 1);
  assert.equal(result.skipped, 1);
  assert.equal(calls.deltas.length, 0);
});

test('refresh assigns only cumulative delta beyond prior runs', async () => {
  const { service, calls } = createDeps({
    getAssignedTotals: () => ({
      inputTokens: 90,
      outputTokens: 30,
      cachedTokens: 4,
      reasoningTokens: 2,
      toolTokens: 1,
      totalTokens: 120,
      rounds: 2,
    }),
  });
  await service.refresh({ force: true });

  assert.equal(calls.deltas[0].delta.inputTokens, 10);
  assert.equal(calls.deltas[0].delta.outputTokens, 10);
  assert.equal(calls.deltas[0].delta.totalTokens, 20);
  assert.equal(calls.deltas[0].delta.rounds, 1);
});

test('startRunForSession records active model metadata for new runtime segment', () => {
  const { service, calls } = createDeps();
  service.startRunForSession({
    row: {
      id: 's1',
      project_id: 'p1',
      provider: 'claude',
      provider_session_id: 'sid',
      session_file_path: '/tmp/a.jsonl',
    },
  });

  assert.equal(calls.started[0].profileName, 'Kimi');
  assert.equal(calls.started[0].modelName, 'kimi-for-coding');
});
```

- [ ] **Step 2: Run sync tests and verify failure**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/pages/settings/token-usage/main/token-usage-sync.service.test.js
```

Expected: FAIL with `Cannot find module './token-usage-sync.service'`.

- [ ] **Step 3: Implement sync service**

Create `src/pages/settings/token-usage/main/token-usage-sync.service.js`:

```js
function toIsoFromMs(value, fallback) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return fallback;
  return new Date(ms).toISOString();
}

function positiveDelta(current, previous) {
  return Math.max(0, Math.floor(Number(current || 0) - Number(previous || 0)));
}

function createUnknownMetadata(provider) {
  return {
    provider,
    profileId: '',
    profileName: 'unknown',
    modelName: 'unknown',
    apiBaseHost: '',
    envFingerprint: '',
  };
}

function createTokenUsageSyncService({
  fs,
  sessionStore,
  tokenUsageStore,
  readSessionStats,
  resolveRunMetadata,
  now,
  logWarn = () => {},
}) {
  function normalizeProvider(value) {
    return String(value || 'claude').toLowerCase();
  }

  function startRunForSession({ row, startedAt = now() }) {
    if (!row) return null;
    const provider = normalizeProvider(row.provider);
    const providerSessionId = String(row.provider_session_id || '');
    if (!providerSessionId) return null;
    const existing = tokenUsageStore.getActiveRunByProviderSession({ provider, providerSessionId });
    if (existing) return existing;
    const meta = resolveRunMetadata(provider);
    return tokenUsageStore.startRun({
      projectId: row.project_id,
      sessionId: row.id,
      provider,
      providerSessionId,
      profileId: meta.profileId,
      profileName: meta.profileName,
      modelName: meta.modelName,
      apiBaseHost: meta.apiBaseHost,
      envFingerprint: meta.envFingerprint,
      sessionFilePath: row.session_file_path || '',
      startedAt,
    });
  }

  function ensureTargetRun(row) {
    const provider = normalizeProvider(row.provider);
    const providerSessionId = String(row.provider_session_id || '');
    const active = tokenUsageStore.getActiveRunByProviderSession({ provider, providerSessionId });
    if (active) return active;
    return tokenUsageStore.startRun({
      projectId: row.project_id,
      sessionId: row.id,
      provider,
      providerSessionId,
      ...createUnknownMetadata(provider),
      sessionFilePath: row.session_file_path || '',
      startedAt: row.updated_at || now(),
    });
  }

  async function syncSession(row, { force = false } = {}) {
    const provider = normalizeProvider(row.provider);
    const providerSessionId = String(row.provider_session_id || '');
    const sessionFilePath = String(row.session_file_path || '').trim();
    if (!providerSessionId || !sessionFilePath) return { ok: false, reason: 'missing session file path' };

    if (!fs.existsSync(sessionFilePath)) {
      const run = ensureTargetRun(row);
      tokenUsageStore.addSnapshotDelta(run.id, {
        sourceMissing: true,
        lastError: 'session file missing',
        fileMtimeMs: 0,
        fileSize: 0,
        statsEndedAt: row.updated_at || now(),
      });
      return { ok: false, reason: 'session file missing' };
    }

    const stat = fs.statSync(sessionFilePath);
    const last = tokenUsageStore.getLastFingerprint({ provider, providerSessionId });
    if (!force && last && Number(last.fileMtimeMs) === Math.floor(stat.mtimeMs) && Number(last.fileSize) === Number(stat.size)) {
      return { ok: true, skipped: true };
    }

    let stats;
    try {
      stats = readSessionStats({ provider, providerSessionId, row });
    } catch (error) {
      const run = ensureTargetRun(row);
      tokenUsageStore.addSnapshotDelta(run.id, {
        fileMtimeMs: Math.floor(stat.mtimeMs),
        fileSize: stat.size,
        statsEndedAt: row.updated_at || now(),
        lastError: error instanceof Error ? error.message : String(error),
      });
      logWarn('token-usage', 'Failed to parse session token stats', {
        provider,
        providerSessionId,
        sessionFilePath,
      });
      return { ok: false, reason: 'parse failed' };
    }

    const assigned = tokenUsageStore.getAssignedTotals({ provider, providerSessionId });
    const run = ensureTargetRun(row);
    const tokens = stats.tokens || {};
    const delta = {
      fileMtimeMs: Math.floor(stat.mtimeMs),
      fileSize: stat.size,
      statsEndedAt: toIsoFromMs(stats.endedAt, row.updated_at || now()),
      inputTokens: positiveDelta(tokens.input, assigned.inputTokens),
      outputTokens: positiveDelta(tokens.output, assigned.outputTokens),
      cachedTokens: positiveDelta(tokens.cached, assigned.cachedTokens),
      reasoningTokens: positiveDelta(tokens.reasoning, assigned.reasoningTokens),
      toolTokens: positiveDelta(tokens.tool, assigned.toolTokens),
      totalTokens: positiveDelta(tokens.total, assigned.totalTokens),
      rounds: positiveDelta(stats.rounds, assigned.rounds),
      sourceMissing: false,
      lastError: '',
    };
    tokenUsageStore.addSnapshotDelta(run.id, delta);
    return { ok: true, skipped: false };
  }

  async function refresh({ force = false } = {}) {
    const rows = [
      ...sessionStore.listAllActive(),
      ...sessionStore.listAllArchived(),
    ].filter((row) => String(row.session_file_path || '').trim());
    const summary = { scanned: 0, updated: 0, skipped: 0, failed: 0 };
    for (const row of rows) {
      summary.scanned += 1;
      const result = await syncSession(row, { force });
      if (result.skipped) summary.skipped += 1;
      else if (result.ok) summary.updated += 1;
      else summary.failed += 1;
    }
    return summary;
  }

  async function finishActiveRunByProviderSession({ provider, providerSessionId, endedAt = now() }) {
    const active = tokenUsageStore.getActiveRunByProviderSession({
      provider: normalizeProvider(provider),
      providerSessionId,
    });
    if (!active) return { ok: false, reason: 'active run not found' };
    const row = sessionStore.getByProviderSessionId({ provider: active.provider, providerSessionId });
    if (row) await syncSession(row, { force: true });
    tokenUsageStore.finishRun(active.id, endedAt);
    return { ok: true };
  }

  return {
    startRunForSession,
    syncSession,
    refresh,
    finishActiveRunByProviderSession,
  };
}

module.exports = { createTokenUsageSyncService };
```

- [ ] **Step 4: Run sync tests**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/pages/settings/token-usage/main/token-usage-sync.service.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit sync service**

```bash
git add src/pages/settings/token-usage/main/token-usage-sync.service.js src/pages/settings/token-usage/main/token-usage-sync.service.test.js
git commit -m "feat: add token usage sync service"
```

---

### Task 4: Runtime Integration for Session Runs

**Files:**

- Modify: `src/pages/settings/settings.main.js`
- Modify: `src/app/main.js`
- Modify: `src/pages/home/terminal/block.main.js`

- [ ] **Step 1: Export token usage services from settings aggregate**

Modify `src/pages/settings/settings.main.js`:

```js
const { createTokenRunMetadataResolver } = require('./token-usage/main/token-run-metadata.service');
const { createTokenUsageSyncService } = require('./token-usage/main/token-usage-sync.service');

module.exports = {
  ...module.exports,
  createTokenRunMetadataResolver,
  createTokenUsageSyncService,
};
```

If the file already uses a single `module.exports = { ... }`, add the two names inside that object instead of assigning twice.

- [ ] **Step 2: Create token usage runtime in app main**

Modify imports in `src/app/main.js`:

```js
const {
  initDatabase,
  projectsRepo,
  sessionsRepo,
  settingsRepo,
  tokenUsageRepo,
} = require('../kernel/db/connection');
```

Add settings aggregate imports:

```js
createTokenRunMetadataResolver,
createTokenUsageSyncService,
```

After `const sessionStore = sessionsRepo(db);`:

```js
const tokenUsageStore = tokenUsageRepo(db);
```

Destructure active profile:

```js
const {
  INTERNAL_ENV_KEY_AUTH_MODE,
  AUTH_MODE_OAUTH,
  INTERNAL_PROXY_ENABLED_KEY,
  INTERNAL_PROXY_URL_KEY,
  applyUnifiedProxyEnv,
  getMergedProviderProfileEnvVars,
  stripPresetValuesFromProviderSettings,
  getStartupEnvForProvider,
  getActiveProviderProfile,
  buildEnvFromPairs,
} = providerRuntime;
```

After `readSessionStats` is created:

```js
const resolveTokenRunMetadata = createTokenRunMetadataResolver({
  normalizeProviderId,
  getActiveProviderProfile,
  getStartupEnvForProvider,
});

const tokenUsageRuntime = createTokenUsageSyncService({
  fs,
  sessionStore,
  tokenUsageStore,
  readSessionStats,
  resolveRunMetadata: resolveTokenRunMetadata,
  now: () => new Date().toISOString(),
  logWarn,
});
```

Pass stores/runtime to IPC context:

```js
tokenUsageStore,
tokenUsageRuntime,
```

- [ ] **Step 3: Finish active run on PTY exit**

Modify `ptyService` `onExit` in `src/app/main.js`:

```js
onExit: ({ sessionId, exitCode }) => {
  oauthLoginTracker.unregisterSession(sessionId);
  void tokenUsageRuntime.finishActiveRunByProviderSession({
    provider: 'claude',
    providerSessionId: sessionId,
    endedAt: new Date().toISOString(),
  });
  logInfo('pty', 'Session exited', { sessionId, exitCode });
  sendToRenderer(TERMINAL_CHANNELS.EXIT, { sessionId, exitCode });
},
```

Then improve it so provider is resolved by active run instead of hard-coded. Add repo method `getActiveRunByAnyProviderSessionId(providerSessionId)` in Task 1 repository if needed, or use `tokenUsageStore.getActiveRunByProviderSession({ provider, providerSessionId })` for `claude`, `codex`, `gemini` in a loop inside `finishActiveRunByRuntimeSessionId(sessionId)`. Prefer adding service method:

```js
async function finishActiveRunByRuntimeSessionId(sessionId, endedAt = now()) {
  for (const provider of ['claude', 'codex', 'gemini']) {
    const result = await finishActiveRunByProviderSession({ provider, providerSessionId: sessionId, endedAt });
    if (result.ok) return result;
  }
  return { ok: false, reason: 'active run not found' };
}
```

Use in `onExit`:

```js
void tokenUsageRuntime.finishActiveRunByRuntimeSessionId(sessionId, new Date().toISOString());
```

- [ ] **Step 4: Record run on session create**

Modify `src/pages/home/terminal/block.main.js` in `SESSION_CREATE` after `createdRecord` is loaded:

```js
if (context.tokenUsageRuntime && createdRecord) {
  context.tokenUsageRuntime.startRunForSession({
    row: createdRecord,
    startedAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 5: Record run on session start only when a new PTY is created**

Modify `SESSION_START` in `src/pages/home/terminal/block.main.js` inside the `if (!ptyService.hasSession(runtimeSessionId))` branch after `ptyService.create(...)`:

```js
if (context.tokenUsageRuntime) {
  context.tokenUsageRuntime.startRunForSession({
    row: record || {
      id: parsed.sessionId,
      project_id: record?.project_id || project?.id || '',
      provider,
      provider_session_id: providerSessionId,
      session_file_path: record?.session_file_path || '',
    },
    startedAt: new Date().toISOString(),
  });
}
```

Keep this call inside the branch so switching to an already running session does not create a duplicate run.

- [ ] **Step 6: Run unit tests**

Run:

```bash
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/pages/home/terminal/block.main.test.js src/pages/settings/token-usage/main/token-usage-sync.service.test.js
```

Expected: PASS. If `block.main.test.js` needs context updates, add `tokenUsageRuntime: { startRunForSession() {} }` only to tests that instantiate session create/start handlers.

- [ ] **Step 7: Commit runtime integration**

```bash
git add src/pages/settings/settings.main.js src/app/main.js src/pages/home/terminal/block.main.js src/pages/home/terminal/block.main.test.js
git commit -m "feat: record token usage runs"
```

---

### Task 5: Token Usage IPC and Preload API

**Files:**

- Create: `src/pages/settings/token-usage/README.md`
- Create: `src/pages/settings/token-usage/shared/token-usage.channels.js`
- Create: `src/pages/settings/token-usage/shared/token-usage.types.ts`
- Create: `src/pages/settings/token-usage/block.main.js`
- Create: `src/pages/settings/token-usage/block.preload.js`
- Create: `src/pages/settings/token-usage/preload/token-usage.api.js`
- Create: `src/pages/settings/token-usage/renderer/token-usage.bridge.ts`
- Modify: `src/app/ipc-schemas.js`

- [ ] **Step 1: Define channels**

Create `src/pages/settings/token-usage/shared/token-usage.channels.js`:

```js
const TOKEN_USAGE_CHANNELS = {
  TOKEN_USAGE_SUMMARY: 'settings:token-usage:summary',
  TOKEN_USAGE_REFRESH: 'settings:token-usage:refresh',
  TOKEN_USAGE_REFRESH_STATUS: 'settings:token-usage:refresh-status',
};

module.exports = { TOKEN_USAGE_CHANNELS };
```

- [ ] **Step 2: Define shared types**

Create `src/pages/settings/token-usage/shared/token-usage.types.ts`:

```ts
export type TokenUsageRange = '7d' | '30d' | 'all';

export interface TokenUsageFilters {
  range?: TokenUsageRange;
  projectId?: string;
  provider?: 'claude' | 'codex' | 'gemini' | '';
  modelName?: string;
}

export interface TokenUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  toolTokens: number;
  totalTokens: number;
  rounds: number;
  sessionCount: number;
  runCount: number;
}

export interface TokenUsageModelSummary {
  provider: string;
  modelName: string;
  profileName: string;
  apiBaseHost: string;
  runCount: number;
  totalTokens: number;
}

export interface TokenUsageSummary {
  filters: TokenUsageFilters;
  totals: TokenUsageTotals;
  models: TokenUsageModelSummary[];
  projects: Array<{ projectId: string; projectName: string; totalTokens: number; sessionCount: number }>;
  daily: Array<{ date: string; totalTokens: number }>;
  sessions: Array<{
    sessionId: string;
    title: string;
    projectName: string;
    provider: string;
    modelName: string;
    totalTokens: number;
    lastActiveAt: string;
  }>;
  status: TokenUsageRefreshStatus;
}

export interface TokenUsageRefreshStatus {
  running: boolean;
  lastStartedAt: string;
  lastFinishedAt: string;
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
  error: string;
}
```

- [ ] **Step 3: Add IPC schemas**

Modify `src/app/ipc-schemas.js`:

```js
const tokenUsageFiltersSchema = z.object({
  range: z.enum(['7d', '30d', 'all']).optional().default('30d'),
  projectId: z.string().optional().default(''),
  provider: z.string().optional().default(''),
  modelName: z.string().optional().default(''),
});
const tokenUsageRefreshSchema = z.object({
  force: z.boolean().optional().default(false),
});
```

Return them from `createIpcSchemas()`:

```js
tokenUsageFiltersSchema,
tokenUsageRefreshSchema,
```

- [ ] **Step 4: Implement block main**

Create `src/pages/settings/token-usage/block.main.js`:

```js
const { TOKEN_USAGE_CHANNELS } = require('./shared/token-usage.channels');

let refreshStatus = {
  running: false,
  lastStartedAt: '',
  lastFinishedAt: '',
  scanned: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  error: '',
};

function registerTokenUsageMain(context = {}) {
  const {
    registerIpc,
    tokenUsageStore,
    tokenUsageRuntime,
    tokenUsageFiltersSchema,
    tokenUsageRefreshSchema,
    logWarn = () => {},
  } = context;

  if (!registerIpc) return;

  registerIpc(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_SUMMARY, async (_event, payload) => {
    const filters = tokenUsageFiltersSchema.parse(payload || {});
    const summary = tokenUsageStore.getSummary(filters);
    return { ok: true, summary: { ...summary, filters, status: refreshStatus } };
  });

  registerIpc(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH_STATUS, async () => ({
    ok: true,
    status: refreshStatus,
  }));

  registerIpc(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH, async (_event, payload) => {
    const parsed = tokenUsageRefreshSchema.parse(payload || {});
    if (refreshStatus.running) return { ok: true, status: refreshStatus };
    refreshStatus = {
      running: true,
      lastStartedAt: new Date().toISOString(),
      lastFinishedAt: refreshStatus.lastFinishedAt || '',
      scanned: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      error: '',
    };
    try {
      const result = await tokenUsageRuntime.refresh({ force: parsed.force });
      refreshStatus = {
        running: false,
        lastStartedAt: refreshStatus.lastStartedAt,
        lastFinishedAt: new Date().toISOString(),
        scanned: result.scanned || 0,
        updated: result.updated || 0,
        skipped: result.skipped || 0,
        failed: result.failed || 0,
        error: '',
      };
      return { ok: true, status: refreshStatus };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('token-usage', 'Refresh failed', { error: message });
      refreshStatus = {
        ...refreshStatus,
        running: false,
        lastFinishedAt: new Date().toISOString(),
        error: message,
      };
      return { ok: false, status: refreshStatus, reason: message };
    }
  });
}

module.exports = { registerTokenUsageMain };
```

- [ ] **Step 5: Implement preload API**

Create `src/pages/settings/token-usage/preload/token-usage.api.js`:

```js
const { ipcRenderer } = require('electron');
const { TOKEN_USAGE_CHANNELS } = require('../shared/token-usage.channels');

function createTokenUsageApi() {
  return {
    tokenUsage: {
      summary: (payload) => ipcRenderer.invoke(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_SUMMARY, payload),
      refresh: (payload) => ipcRenderer.invoke(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH, payload),
      status: () => ipcRenderer.invoke(TOKEN_USAGE_CHANNELS.TOKEN_USAGE_REFRESH_STATUS),
    },
  };
}

module.exports = { createTokenUsageApi };
```

Create `src/pages/settings/token-usage/block.preload.js`:

```js
const { createTokenUsageApi } = require('./preload/token-usage.api');

function createTokenUsagePreloadApi() {
  return createTokenUsageApi();
}

module.exports = { createTokenUsagePreloadApi };
```

- [ ] **Step 6: Implement renderer bridge**

Create `src/pages/settings/token-usage/renderer/token-usage.bridge.ts`:

```ts
import type { TokenUsageFilters, TokenUsageRefreshStatus, TokenUsageSummary } from '../shared/token-usage.types';

export const tokenUsageBridge = {
  summary(payload: TokenUsageFilters): Promise<{ ok: true; summary: TokenUsageSummary } | { ok: false; reason: string }> {
    return window.electronAPI.tokenUsage.summary(payload);
  },
  refresh(payload: { force?: boolean } = {}): Promise<{ ok: boolean; status: TokenUsageRefreshStatus; reason?: string }> {
    return window.electronAPI.tokenUsage.refresh(payload);
  },
  status(): Promise<{ ok: true; status: TokenUsageRefreshStatus }> {
    return window.electronAPI.tokenUsage.status();
  },
};
```

- [ ] **Step 7: Add README**

Create `src/pages/settings/token-usage/README.md`:

```md
# settings/token-usage

Settings 内的 token 消耗统计区块。

- `main/` 和 `block.main.js` 注册统计 IPC、触发同步、读取 SQLite 聚合。
- `preload/` 只暴露 `window.electronAPI.tokenUsage`。
- `renderer/` 只渲染 Settings 内 Token 统计页面并调用私有 bridge。
- `shared/` 放 channel 和跨运行端类型。

范围只包含当前数据库已登记的项目与会话，不扫描未登记 CLI 历史文件。
```

- [ ] **Step 8: Run syntax checks**

Run:

```bash
node --check src/pages/settings/token-usage/block.main.js
node --check src/pages/settings/token-usage/block.preload.js
node --check src/pages/settings/token-usage/preload/token-usage.api.js
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit IPC layer**

```bash
git add src/app/ipc-schemas.js src/pages/settings/token-usage/README.md src/pages/settings/token-usage/shared/token-usage.channels.js src/pages/settings/token-usage/shared/token-usage.types.ts src/pages/settings/token-usage/block.main.js src/pages/settings/token-usage/block.preload.js src/pages/settings/token-usage/preload/token-usage.api.js src/pages/settings/token-usage/renderer/token-usage.bridge.ts
git commit -m "feat: add token usage ipc"
```

---

### Task 6: Settings Token Usage Renderer UI

**Files:**

- Create: `src/pages/settings/token-usage/block.renderer.tsx`
- Create: `src/pages/settings/token-usage/renderer/use-token-usage.js`
- Create: `src/pages/settings/token-usage/renderer/TokenUsageSettingsSection.jsx`
- Modify: `src/pages/settings/providers/renderer/SettingsSideNav.jsx`
- Modify: `src/pages/settings/providers/renderer/SettingsModal.jsx`
- Modify: `src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: Implement renderer block entry**

Create `src/pages/settings/token-usage/block.renderer.tsx`:

```tsx
import { TokenUsageSettingsSection } from './renderer/TokenUsageSettingsSection';

export const tokenUsageRenderer = {
  settings: TokenUsageSettingsSection,
};

export { TokenUsageSettingsSection };
```

- [ ] **Step 2: Implement hook**

Create `src/pages/settings/token-usage/renderer/use-token-usage.js`:

```js
import { useCallback, useEffect, useMemo, useState } from 'react';

import { tokenUsageBridge } from './token-usage.bridge';

const EMPTY_STATUS = {
  running: false,
  lastStartedAt: '',
  lastFinishedAt: '',
  scanned: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  error: '',
};

const EMPTY_SUMMARY = {
  filters: { range: '30d', projectId: '', provider: '', modelName: '' },
  totals: {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    toolTokens: 0,
    totalTokens: 0,
    rounds: 0,
    sessionCount: 0,
    runCount: 0,
  },
  models: [],
  projects: [],
  daily: [],
  sessions: [],
  status: EMPTY_STATUS,
};

export function useTokenUsage() {
  const [filters, setFilters] = useState({ range: '30d', projectId: '', provider: '', modelName: '' });
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async (nextFilters = filters) => {
    setLoading(true);
    setError('');
    try {
      const result = await tokenUsageBridge.summary(nextFilters);
      if (!result.ok) throw new Error(result.reason || 'Token 统计读取失败');
      setSummary({ ...EMPTY_SUMMARY, ...result.summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const refresh = useCallback(async ({ force = false } = {}) => {
    setRefreshing(true);
    setError('');
    try {
      const result = await tokenUsageBridge.refresh({ force });
      if (!result.ok) throw new Error(result.reason || 'Token 统计刷新失败');
      await loadSummary(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [filters, loadSummary]);

  useEffect(() => {
    void loadSummary(filters);
    void refresh({ force: false });
  }, []);

  useEffect(() => {
    void loadSummary(filters);
  }, [filters]);

  const modelOptions = useMemo(
    () => Array.from(new Set((summary.models || []).map((item) => item.modelName).filter(Boolean))),
    [summary.models],
  );

  return {
    filters,
    setFilters,
    summary,
    loading,
    refreshing,
    error,
    modelOptions,
    reload: () => loadSummary(filters),
    refresh,
  };
}
```

- [ ] **Step 3: Implement confirmed UI section**

Create `src/pages/settings/token-usage/renderer/TokenUsageSettingsSection.jsx` with the confirmed layout. Use Tailwind classes matching existing Settings styling:

```jsx
import { RefreshCcw } from 'lucide-react';

import { Button } from '../../../../ui/button';
import { useTokenUsage } from './use-token-usage';

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(Number(value || 0))));
}

function formatDateLabel(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-[7px] border border-white/[0.07] bg-[#111316] px-3 py-3">
      <div className="mb-2 text-[11px] text-[#8A8A90]">{label}</div>
      <strong className="block text-[18px] leading-none text-[#EDEDEF]">{formatNumber(value)}</strong>
      {hint && <div className="mt-2 text-[11px] text-[#B8BCC6]">{hint}</div>}
    </div>
  );
}

function SelectButton({ children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[31px] rounded-[6px] border px-3 text-[12px] ${
        active
          ? 'border-[#3D4D72] bg-[#3D4D72] text-white'
          : 'border-white/[0.1] bg-white/[0.055] text-[#B8BCC6]'
      }`}
    >
      {children}
    </button>
  );
}

export function TokenUsageSettingsSection() {
  const { filters, setFilters, summary, loading, refreshing, error, modelOptions, refresh } = useTokenUsage();
  const totals = summary.totals || {};
  const maxDaily = Math.max(1, ...(summary.daily || []).map((item) => Number(item.totalTokens || 0)));

  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-[#EDEDEF]">Token 统计</h2>
          <p className="mt-1 text-[12px] text-[#8A8A90]">
            只统计当前数据库已登记的项目与会话，模型按运行段快照归属。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-[6px] border border-white/[0.1] bg-white/[0.045] px-2.5 py-1.5 text-[12px] text-[#B8BCC6]">
            {summary.status?.running || refreshing ? '同步中...' : `上次同步：${formatDateLabel(summary.status?.lastFinishedAt)}`}
          </span>
          <Button type="button" className="inline-save-btn h-8 gap-2 rounded-[6px]" onClick={() => refresh({ force: true })}>
            <RefreshCcw size={14} />
            重新扫描
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['7d', '30d', 'all'].map((range) => (
          <SelectButton key={range} active={filters.range === range} onClick={() => setFilters((prev) => ({ ...prev, range }))}>
            {range === '7d' ? '最近 7 天' : range === '30d' ? '最近 30 天' : '全部时间'}
          </SelectButton>
        ))}
        {['', 'claude', 'codex', 'gemini'].map((provider) => (
          <SelectButton key={provider || 'all'} active={filters.provider === provider} onClick={() => setFilters((prev) => ({ ...prev, provider }))}>
            {provider || '全部 Provider'}
          </SelectButton>
        ))}
        <select
          className="h-[31px] rounded-[6px] border border-white/[0.1] bg-[#15181D] px-3 text-[12px] text-[#B8BCC6]"
          value={filters.modelName || ''}
          onChange={(event) => setFilters((prev) => ({ ...prev, modelName: event.target.value }))}
        >
          <option value="">全部模型</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-[6px] border border-red-400/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</div>}
      {loading && <div className="text-[12px] text-[#8A8A90]">加载中...</div>}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <MetricCard label="总 Token" value={totals.totalTokens} hint={`${formatNumber(totals.runCount)} 个运行段`} />
        <MetricCard label="输入" value={totals.inputTokens} />
        <MetricCard label="输出" value={totals.outputTokens} />
        <MetricCard label="缓存" value={totals.cachedTokens} />
        <MetricCard label="Reasoning" value={totals.reasoningTokens} />
        <MetricCard label="轮次" value={totals.rounds} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <section className="overflow-hidden rounded-[7px] border border-white/[0.07] bg-[#111316]">
          <div className="flex h-[42px] items-center justify-between border-b border-white/[0.07] px-3">
            <h3 className="text-[13px] font-semibold text-[#EDEDEF]">日趋势</h3>
            <span className="text-[11px] text-[#8A8A90]">按最后活跃日期归属</span>
          </div>
          <div className="grid h-[202px] grid-cols-7 items-end gap-2 p-4 md:grid-cols-14">
            {(summary.daily || []).map((item) => (
              <div key={item.date} className="grid h-full items-end gap-1 text-center text-[10px] text-[#8A8A90]">
                <div className="min-h-[5px] rounded-t-[4px] bg-[#6FD6A5]" style={{ height: `${Math.max(5, (Number(item.totalTokens || 0) / maxDaily) * 100)}%` }} />
                <span>{formatDateLabel(item.date)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[7px] border border-white/[0.07] bg-[#111316]">
          <div className="flex h-[42px] items-center justify-between border-b border-white/[0.07] px-3">
            <h3 className="text-[13px] font-semibold text-[#EDEDEF]">模型汇总</h3>
            <span className="text-[11px] text-[#8A8A90]">按运行段聚合</span>
          </div>
          <div className="grid gap-2 p-2.5">
            {(summary.models || []).map((item) => (
              <div key={`${item.provider}:${item.modelName}:${item.apiBaseHost}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[6px] border border-white/[0.07] bg-white/[0.035] p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#EDEDEF]">
                    <span className="mr-2 rounded-[5px] border border-white/[0.1] bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-[#B8BCC6]">{item.provider}</span>
                    {item.modelName || 'unknown'}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[#8A8A90]">{item.profileName || 'unknown'} · {item.apiBaseHost || 'unknown'} · {item.runCount} 段</div>
                </div>
                <strong className="text-[13px] text-[#EDEDEF]">{formatNumber(item.totalTokens)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add nav item**

Modify `src/pages/settings/providers/renderer/SettingsSideNav.jsx`:

```jsx
import { BarChart3 } from 'lucide-react';
```

Add trigger between Archive and About:

```jsx
<TabsTrigger
  value="token-usage"
  className="h-8 w-full justify-start gap-2 rounded-[4px] bg-transparent px-2.5 text-[13px] font-normal text-[#8A8A90] transition-colors duration-150 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[#EDEDEF]"
>
  <BarChart3 size={14} />
  Token 统计
</TabsTrigger>
```

- [ ] **Step 5: Add modal section**

Modify `src/pages/settings/providers/renderer/SettingsModal.jsx`:

```js
import { TokenUsageSettingsSection } from '../../token-usage/renderer/TokenUsageSettingsSection';
```

Update `headerMeta`:

```js
if (settingsSection === 'token-usage') {
  return {
    title: 'Token 统计',
    subtitle: 'Review token usage by project, provider, model, and run segment.',
  };
}
```

Update `onSectionChange`:

```js
if (value === 'token-usage') {
  onSelectTokenUsage();
  return;
}
```

Add prop:

```js
onSelectTokenUsage,
```

Add tabs content:

```jsx
<TabsContent value="token-usage" className="mt-0 h-full">
  <TokenUsageSettingsSection />
</TabsContent>
```

- [ ] **Step 6: Add standalone Settings page section**

Modify `src/pages/settings/SettingsPage.tsx`:

```ts
import { TokenUsageSettingsSection } from './token-usage/renderer/TokenUsageSettingsSection';

type SettingsSection = 'providers' | 'archive' | 'token-usage' | 'about';
```

Add nav item:

```ts
{ id: 'token-usage' as const, label: 'Token 统计' },
```

Add content:

```tsx
{section === 'token-usage' && <TokenUsageSettingsSection />}
```

- [ ] **Step 7: Update HomePage modal props**

Find `SettingsModal` usage in `src/pages/home/HomePage.tsx` and add:

```jsx
onSelectTokenUsage={() => setSettingsSection('token-usage')}
```

- [ ] **Step 8: Run build for renderer type integration**

Run:

```bash
pnpm build
```

Expected: PASS. Existing chunk size warnings are acceptable.

- [ ] **Step 9: Commit renderer UI**

```bash
git add src/pages/settings/token-usage/block.renderer.tsx src/pages/settings/token-usage/renderer/use-token-usage.js src/pages/settings/token-usage/renderer/TokenUsageSettingsSection.jsx src/pages/settings/providers/renderer/SettingsSideNav.jsx src/pages/settings/providers/renderer/SettingsModal.jsx src/pages/settings/SettingsPage.tsx src/pages/home/HomePage.tsx
git commit -m "feat: add token usage settings ui"
```

---

### Task 7: Page Registration, Types, Architecture Guard

**Files:**

- Modify: `src/app/register-page-main.js`
- Modify: `src/app/register-page-preload.js`
- Modify: `src/app/register-page-renderer.tsx`
- Modify: `src/app/env.d.ts`
- Modify: `scripts/check-architecture.js`

- [ ] **Step 1: Register main block**

Modify `src/app/register-page-main.js`:

```js
const { registerTokenUsageMain } = require('../pages/settings/token-usage/block.main');
```

Inside `registerPageMain()`:

```js
registerTokenUsageMain(context);
```

- [ ] **Step 2: Register preload block**

Modify `src/app/register-page-preload.js`:

```js
const { createTokenUsagePreloadApi } = require('../pages/settings/token-usage/block.preload');
```

Add to `mergeApis()` call:

```js
createTokenUsagePreloadApi(),
```

- [ ] **Step 3: Register renderer block**

Modify `src/app/register-page-renderer.tsx`:

```ts
import { tokenUsageRenderer } from '../pages/settings/token-usage/block.renderer';
```

Add:

```ts
tokenUsage: tokenUsageRenderer,
```

- [ ] **Step 4: Update preload type declaration**

Modify `src/app/env.d.ts` by adding under `electronAPI`:

```ts
tokenUsage: {
  summary(payload?: {
    range?: '7d' | '30d' | 'all';
    projectId?: string;
    provider?: string;
    modelName?: string;
  }): Promise<any>;
  refresh(payload?: { force?: boolean }): Promise<any>;
  status(): Promise<any>;
};
```

- [ ] **Step 5: Add architecture guard for token usage boundaries**

Modify `scripts/check-architecture.js` to catch token usage renderer importing terminal internals:

```js
if (
  relative.startsWith('src/pages/settings/token-usage/renderer/') &&
  /pages\/home\/terminal|home\/terminal\/renderer|home\/terminal\/preload|home\/terminal\/main/.test(source)
) {
  violations.push(`${relative}: token-usage renderer must not import terminal internals`);
}
```

Also guard against token usage importing terminal bridge anywhere:

```js
if (
  relative.startsWith('src/pages/settings/token-usage/') &&
  /terminal\.bridge/.test(source)
) {
  violations.push(`${relative}: token-usage must not import terminal bridge`);
}
```

- [ ] **Step 6: Run architecture and build**

Run:

```bash
node scripts/check-architecture.js
pnpm build
```

Expected:

- `node scripts/check-architecture.js` prints `[architecture] ok`.
- `pnpm build` passes.

- [ ] **Step 7: Commit registration**

```bash
git add src/app/register-page-main.js src/app/register-page-preload.js src/app/register-page-renderer.tsx src/app/env.d.ts scripts/check-architecture.js
git commit -m "feat: register token usage page block"
```

---

### Task 8: E2E and Final Verification

**Files:**

- Create: `src/pages/settings/token-usage/e2e/token-usage.e2e.js`
- Modify: `docs/todolist6.md` only if an existing checklist item directly covers token usage work.

- [ ] **Step 1: Write E2E fixture test**

Create `src/pages/settings/token-usage/e2e/token-usage.e2e.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

function writeClaudeSession(filePath, cwd) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-04T01:00:00.000Z',
      cwd,
      message: { role: 'user', content: 'hello' },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-04T01:01:00.000Z',
      cwd,
      uuid: 'm1',
      message: {
        id: 'm1',
        role: 'assistant',
        content: 'world',
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          cache_read_input_tokens: 10,
          reasoning_output_tokens: 5,
          total_tokens: 140,
        },
      },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

test.describe('settings token usage', () => {
  let app;

  test.beforeAll(async () => {
    let sessionPath = '';
    app = await launchApp({
      cwd: path.resolve(__dirname, '../../../../../'),
      projectName: 'token-project',
      defaultProvider: 'claude',
      providerSettings: {
        providers: {
          claude: {
            defaultProfileId: 'kimi',
            enabledProfileId: 'kimi',
            profiles: [
              {
                id: 'kimi',
                name: 'Kimi',
                envVars: [
                  { key: 'ANTHROPIC_MODEL', value: 'kimi-for-coding' },
                  { key: 'ANTHROPIC_BASE_URL', value: 'https://api.moonshot.cn/anthropic' },
                  { key: 'ANTHROPIC_AUTH_TOKEN', value: 'dummy' },
                ],
              },
            ],
          },
          codex: { defaultProfileId: 'oauth-login', enabledProfileId: '', profiles: [{ id: 'oauth-login', name: 'OAuth', envVars: [] }] },
          gemini: { defaultProfileId: 'oauth-login', enabledProfileId: '', profiles: [{ id: 'oauth-login', name: 'OAuth', envVars: [] }] },
        },
      },
      prepareFs: ({ root, projectDir }) => {
        const sid = 'token-session-1';
        sessionPath = path.join(root, '.claude', 'projects', 'token-project', `${sid}.jsonl`);
        writeClaudeSession(sessionPath, projectDir);
      },
      seedDb: ({ db, projectId, projectDir }) => {
        const sid = 'token-session-1';
        const now = '2026-06-04T01:02:00.000Z';
        db.prepare(`
          INSERT INTO sessions (
            id, project_id, title, provider, provider_session_id, cwd, session_file_path,
            status, sort_order, title_source, last_active_at, created_at, updated_at, is_archived, archived_at
          ) VALUES (
            's-token-1', ?, 'Token fixture', 'claude', ?, ?, ?, 'exited',
            1, 'manual', ?, ?, ?, 0, NULL
          )
        `).run(projectId, sid, projectDir, sessionPath, now, now, now);
      },
    });
  });

  test.afterAll(async () => {
    await closeApp(app);
  });

  test('shows token usage settings from registered session files', async () => {
    const page = app.window;
    await page.getByRole('button', { name: /Settings/i }).click();
    await page.getByRole('tab', { name: /Token 统计/i }).click();
    await expect(page.getByRole('heading', { name: 'Token 统计' })).toBeVisible();
    await page.getByRole('button', { name: /重新扫描/i }).click();
    await expect(page.getByText('kimi-for-coding')).toBeVisible();
    await expect(page.getByText('140')).toBeVisible();

    const db = new DatabaseSync(app.dbPath);
    try {
      const rows = db.prepare('SELECT COUNT(*) AS count FROM token_usage_runs').all();
      expect(Number(rows[0].count)).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run E2E list**

Run:

```bash
pnpm test:e2e --list
```

Expected: command exits 0 and includes `settings token usage`.

- [ ] **Step 3: Run targeted E2E**

Run:

```bash
pnpm exec playwright test src/pages/settings/token-usage/e2e/token-usage.e2e.js
```

Expected: PASS. If existing unrelated E2E infrastructure has a known startup issue, capture the exact failure and still run unit/build verification.

- [ ] **Step 4: Run full verification**

Run:

```bash
node scripts/check-architecture.js
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron --test src/kernel/db/migrations/token-usage-tables.test.js src/kernel/db/repositories/token-usage.repository.test.js src/pages/settings/token-usage/main/token-run-metadata.service.test.js src/pages/settings/token-usage/main/token-usage-sync.service.test.js src/pages/home/terminal/block.main.test.js
pnpm build
```

Expected:

- Architecture check prints `[architecture] ok`.
- Electron unit tests pass.
- Build passes. Existing chunk size warnings are acceptable.

- [ ] **Step 5: Commit E2E and final docs**

```bash
git add src/pages/settings/token-usage/e2e/token-usage.e2e.js docs/todolist6.md
git commit -m "test: cover token usage settings"
```

If `docs/todolist6.md` was not modified, use:

```bash
git add src/pages/settings/token-usage/e2e/token-usage.e2e.js
git commit -m "test: cover token usage settings"
```

---

## Self-Review

Spec coverage:

- Settings Token 统计入口：Task 6 and Task 7.
- 项目级/全局历史统计：Task 1 repository summary and Task 5 IPC.
- 混合刷新：Task 3 sync service and Task 5 refresh IPC.
- 只统计 DB 已登记会话：Task 3 uses `sessionStore.listAllActive()` and `listAllArchived()` only.
- 日期按最后活跃归属：Task 1 summary uses `stats_ended_at`, `run_ended_at`, `updated_at`; Task 3 writes `statsEndedAt`.
- Claude 内不同模型区分：Task 2 captures model/base/fingerprint; Task 3 assigns deltas to run segments.
- 同一会话跨模型恢复：Task 1 supports multiple runs per provider session; Task 3 assigns only unassigned delta to current run.
- UI confirmed layout：Task 6 implements the visual companion layout.
- 错误处理：Task 3 handles missing files and parse failures; Task 1 stores `source_missing` and `last_error`.
- 测试：Tasks 1, 2, 3, 4, 8 include unit, architecture, build, and E2E coverage.

Placeholder scan:

- No unresolved placeholder markers.
- No deferred implementation markers.
- Error handling cases are specified with concrete behavior.
- All new public functions named in later tasks are defined in earlier tasks.

Type consistency:

- IPC names use `TOKEN_USAGE_SUMMARY`, `TOKEN_USAGE_REFRESH`, `TOKEN_USAGE_REFRESH_STATUS`.
- Renderer API uses `window.electronAPI.tokenUsage.summary/refresh/status`.
- Run metadata uses `profileId/profileName/modelName/apiBaseHost/envFingerprint`.
- DB columns use snake_case; renderer/API view uses camelCase.
