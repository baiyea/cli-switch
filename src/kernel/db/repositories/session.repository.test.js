const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { buildSchemaSql } = require('../schema');
const { createSessionsRepo } = require('./session.repository');

function createRepo() {
  const conn = new Database(':memory:');
  conn.exec(buildSchemaSql());
  conn
    .prepare(
      `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
       VALUES ('p1', 'Project', '/tmp/project', 'claude', '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z')`,
    )
    .run();
  let nextId = 0;
  const repo = createSessionsRepo({
    getDatabase: () => conn,
    now: () => '2026-05-29T00:00:00.000Z',
    genId: () => `session-${++nextId}`,
    sessionModel: { tableName: 'sessions' },
  });
  return { conn, repo };
}

test('create stores new sessions with auto title source by default', () => {
  const { conn, repo } = createRepo();

  repo.create({
    projectId: 'p1',
    title: 'codex-01',
    provider: 'codex',
    providerSessionId: 'codex-local',
    cwd: '/tmp/project',
    status: 'running',
  });

  const row = conn
    .prepare('SELECT title, title_source FROM sessions WHERE provider_session_id = ?')
    .get('codex-local');
  assert.equal(row.title, 'codex-01');
  assert.equal(row.title_source, 'auto');
});

test('auto title update derives auto titles and never overwrites manual titles', () => {
  const { conn, repo } = createRepo();

  repo.create({
    projectId: 'p1',
    title: 'codex-01',
    provider: 'codex',
    providerSessionId: 'codex-local',
    cwd: '/tmp/project',
    status: 'running',
  });

  const first = repo.updateAutoTitleByProviderSessionId({
    provider: 'codex',
    providerSessionId: 'codex-local',
    title: '实现自动标题',
  });
  assert.equal(first.changed, true);
  let row = conn
    .prepare('SELECT title, title_source FROM sessions WHERE provider_session_id = ?')
    .get('codex-local');
  assert.equal(row.title, '实现自动标题');
  assert.equal(row.title_source, 'derived');

  repo.renameByProviderSessionId({
    provider: 'codex',
    providerSessionId: 'codex-local',
    title: '手动命名',
  });

  const second = repo.updateAutoTitleByProviderSessionId({
    provider: 'codex',
    providerSessionId: 'codex-local',
    title: '不应该覆盖',
  });
  assert.equal(second.changed, false);
  row = conn
    .prepare('SELECT title, title_source FROM sessions WHERE provider_session_id = ?')
    .get('codex-local');
  assert.equal(row.title, '手动命名');
  assert.equal(row.title_source, 'manual');
});

test('discovered fallback title does not overwrite a derived title', () => {
  const { conn, repo } = createRepo();

  repo.upsertDiscovered({
    projectId: 'p1',
    title: '整理会话标题',
    provider: 'codex',
    providerSessionId: '019e3a06-d250-7fb2-80ae-b3d0c330e385',
    cwd: '/tmp/project',
    sessionFilePath: '/tmp/project/session.jsonl',
    createdAt: Date.parse('2026-05-29T00:00:00.000Z'),
    titleSource: 'derived',
  });

  repo.upsertDiscovered({
    projectId: 'p1',
    title: 'session-019e3a06-d250',
    provider: 'codex',
    providerSessionId: '019e3a06-d250-7fb2-80ae-b3d0c330e385',
    cwd: '/tmp/project',
    sessionFilePath: '/tmp/project/session.jsonl',
    createdAt: Date.parse('2026-05-29T00:00:00.000Z'),
    titleSource: 'auto',
  });

  const row = conn
    .prepare('SELECT title, title_source FROM sessions WHERE provider_session_id = ?')
    .get('019e3a06-d250-7fb2-80ae-b3d0c330e385');
  assert.equal(row.title, '整理会话标题');
  assert.equal(row.title_source, 'derived');
});

test('reorderActiveByProject persists order and reports matched rows', () => {
  const { conn, repo } = createRepo();

  for (const providerSessionId of ['one', 'two', 'three']) {
    repo.create({
      projectId: 'p1',
      title: providerSessionId,
      provider: 'claude',
      providerSessionId,
      cwd: '/tmp/project',
      status: 'exited',
    });
  }

  const result = repo.reorderActiveByProject({
    projectId: 'p1',
    orderedSessions: [
      { provider: 'claude', providerSessionId: 'three' },
      { provider: 'claude', providerSessionId: 'one' },
      { provider: 'claude', providerSessionId: 'two' },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    projectId: 'p1',
    requestedCount: 3,
    matchedCount: 3,
    updatedCount: 3,
  });
  const rows = conn
    .prepare(
      `SELECT provider_session_id FROM sessions
       WHERE project_id = 'p1' AND is_archived = 0
       ORDER BY sort_order DESC`,
    )
    .all()
    .map((row) => row.provider_session_id);
  assert.deepEqual(rows, ['three', 'one', 'two']);
});
