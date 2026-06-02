const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { ensureLegacyColumns } = require('./legacy-columns');

test('legacy session title_source migration protects natural titles and lengthens short fallback titles', () => {
  const conn = new Database(':memory:');
  conn.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      cwd TEXT NOT NULL DEFAULT '',
      session_file_path TEXT,
      status TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_active_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT
    );
  `);
  const insert = conn.prepare(`
    INSERT INTO sessions (
      id, project_id, title, provider, provider_session_id, cwd, status,
      sort_order, last_active_at, created_at, updated_at, is_archived
    ) VALUES (?, 'p1', ?, 'codex', ?, '/tmp/project', 'exited', 0,
      '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z',
      '2026-05-29T00:00:00.000Z', 0)
  `);
  insert.run(
    's1',
    'session-019e3a06',
    '019e3a06-d250-7fb2-80ae-b3d0c330e385',
  );
  insert.run('s2', '已经命名的自然语言标题', '019e3a06-d29a-7ed0-a58a-238c41ea41b4');

  ensureLegacyColumns(conn);

  const rows = conn
    .prepare('SELECT id, title, title_source FROM sessions ORDER BY id')
    .all();
  assert.deepEqual(rows, [
    { id: 's1', title: 'session-019e3a06-d250', title_source: 'auto' },
    { id: 's2', title: '已经命名的自然语言标题', title_source: 'manual' },
  ]);
});
