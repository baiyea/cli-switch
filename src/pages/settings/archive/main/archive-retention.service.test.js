const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { buildSchemaSql } = require('../../../../kernel/db/schema');
const { createSessionsRepo } = require('../../../../kernel/db/repositories/session.repository');
const { createArchiveRetentionService } = require('./archive-retention.service');

function createRepo() {
  const conn = new Database(':memory:');
  conn.exec(buildSchemaSql());
  conn
    .prepare(
      `INSERT INTO projects (id, name, path, default_provider, created_at, updated_at)
       VALUES ('p1', 'Project', '/tmp/project', 'claude', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
    )
    .run();
  let nextId = 0;
  const repo = createSessionsRepo({
    getDatabase: () => conn,
    now: () => '2026-06-01T00:00:00.000Z',
    genId: () => `session-${++nextId}`,
    sessionModel: { tableName: 'sessions' },
  });
  return { conn, repo };
}

function createSession(repo, input) {
  const row = repo.create({
    projectId: 'p1',
    title: input.title,
    provider: input.provider || 'claude',
    providerSessionId: input.providerSessionId,
    cwd: '/tmp/project',
    sessionFilePath: input.sessionFilePath,
    status: 'exited',
  });
  return row.id;
}

test('cleanupExpiredArchivedSessions removes only expired archived provider files and rows', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-switch-archive-retention-'));
  const providerRoot = path.join(tmpRoot, '.claude', 'projects');
  const unsafeRoot = path.join(tmpRoot, 'outside');
  fs.mkdirSync(providerRoot, { recursive: true });
  fs.mkdirSync(unsafeRoot, { recursive: true });

  const expiredFile = path.join(providerRoot, 'expired.jsonl');
  const recentFile = path.join(providerRoot, 'recent.jsonl');
  const activeFile = path.join(providerRoot, 'active.jsonl');
  const missingFile = path.join(providerRoot, 'missing.jsonl');
  const unsafeFile = path.join(unsafeRoot, 'unsafe.jsonl');
  for (const filePath of [expiredFile, recentFile, activeFile, unsafeFile]) {
    fs.writeFileSync(filePath, '{}\n', 'utf8');
  }

  const { conn, repo } = createRepo();
  const expiredId = createSession(repo, {
    title: 'expired',
    providerSessionId: 'expired',
    sessionFilePath: expiredFile,
  });
  const missingId = createSession(repo, {
    title: 'missing',
    providerSessionId: 'missing',
    sessionFilePath: missingFile,
  });
  const unsafeId = createSession(repo, {
    title: 'unsafe',
    providerSessionId: 'unsafe',
    sessionFilePath: unsafeFile,
  });
  const recentId = createSession(repo, {
    title: 'recent',
    providerSessionId: 'recent',
    sessionFilePath: recentFile,
  });
  const activeId = createSession(repo, {
    title: 'active',
    providerSessionId: 'active',
    sessionFilePath: activeFile,
  });

  conn
    .prepare('UPDATE sessions SET is_archived = 1, archived_at = ? WHERE id IN (?, ?, ?)')
    .run('2026-04-20T00:00:00.000Z', expiredId, missingId, unsafeId);
  conn
    .prepare('UPDATE sessions SET is_archived = 1, archived_at = ? WHERE id = ?')
    .run('2026-05-20T00:00:00.000Z', recentId);
  conn
    .prepare('UPDATE sessions SET is_archived = 0, archived_at = NULL WHERE id = ?')
    .run(activeId);

  const service = createArchiveRetentionService({
    sessionStore: repo,
    providerRoots: { claude: [providerRoot] },
    now: () => new Date('2026-06-01T00:00:00.000Z'),
  });

  const result = service.cleanupExpiredArchivedSessions();

  assert.equal(result.ok, true);
  assert.equal(result.scanned, 3);
  assert.equal(result.deletedRecords, 2);
  assert.equal(result.deletedFiles, 1);
  assert.equal(result.missingFiles, 1);
  assert.equal(result.skipped, 1);
  assert.equal(fs.existsSync(expiredFile), false);
  assert.equal(fs.existsSync(recentFile), true);
  assert.equal(fs.existsSync(activeFile), true);
  assert.equal(fs.existsSync(unsafeFile), true);
  assert.deepEqual(
    conn.prepare('SELECT id FROM sessions ORDER BY id').all().map((row) => row.id),
    [unsafeId, recentId, activeId].sort(),
  );
  assert.match(result.warnings.join('\n'), /outside provider session roots/);
});
