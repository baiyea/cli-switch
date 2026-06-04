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

  const runForeignKeys = conn
    .prepare('PRAGMA foreign_key_list(token_usage_runs)')
    .all()
    .map((row) => ({
      table: row.table,
      from: row.from,
      to: row.to,
    }));
  assert.deepEqual(runForeignKeys, [
    { table: 'sessions', from: 'session_id', to: 'id' },
    { table: 'projects', from: 'project_id', to: 'id' },
  ]);
});
