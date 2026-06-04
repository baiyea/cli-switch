const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { ensureTokenUsageTables } = require('../migrations/token-usage-tables');
const { createTokenUsageRepo } = require('./token-usage.repository');

function createRepo() {
  const conn = new Database(':memory:');
  conn.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY
    );
    INSERT INTO projects (id) VALUES ('project-1'), ('project-2');
    INSERT INTO sessions (id) VALUES ('session-1');
  `);
  ensureTokenUsageTables(conn);

  let seq = 0;
  const repo = createTokenUsageRepo({
    getDatabase: () => conn,
    now: () => '2026-06-04T00:00:00.000Z',
    genId: () => `run-${++seq}`,
  });

  return { conn, repo };
}

function startRun(repo, overrides = {}) {
  return repo.startRun({
    projectId: 'project-1',
    sessionId: 'session-1',
    provider: 'claude',
    providerSessionId: 'provider-session-1',
    profileId: 'profile-1',
    profileName: 'Moonshot',
    modelName: 'kimi-k2',
    apiBaseHost: 'api.moonshot.cn',
    envFingerprint: 'fingerprint-1',
    sessionFilePath: '/tmp/session.jsonl',
    runStartedAt: '2026-06-04T01:00:00.000Z',
    ...overrides,
  });
}

test('startRun stores and returns a snake_case run row', () => {
  const { conn, repo } = createRepo();

  const row = startRun(repo);

  assert.equal(row.id, 'run-1');
  assert.equal(row.project_id, 'project-1');
  assert.equal(row.provider, 'claude');
  assert.equal(row.provider_session_id, 'provider-session-1');
  assert.equal(row.model_name, 'kimi-k2');
  assert.equal(row.run_started_at, '2026-06-04T01:00:00.000Z');
  assert.equal(row.run_ended_at, null);
  assert.equal(row.created_at, '2026-06-04T00:00:00.000Z');

  const count = conn.prepare('SELECT COUNT(*) AS count FROM token_usage_runs').get().count;
  assert.equal(count, 1);
});

test('addSnapshotDelta upserts and accumulates token deltas for one run', () => {
  const { conn, repo } = createRepo();
  const run = startRun(repo);

  repo.addSnapshotDelta(run.id, {
    fileMtimeMs: 100,
    fileSize: 200,
    statsEndedAt: '2026-06-04T01:02:00.000Z',
    inputTokens: 10,
    outputTokens: 5,
    cachedTokens: 2,
    reasoningTokens: 1,
    toolTokens: 3,
    totalTokens: 21,
    rounds: 1,
  });
  repo.addSnapshotDelta(run.id, {
    fileMtimeMs: 120,
    fileSize: 240,
    statsEndedAt: '2026-06-04T01:04:00.000Z',
    inputTokens: 7,
    outputTokens: 6,
    cachedTokens: 4,
    reasoningTokens: 2,
    toolTokens: 1,
    totalTokens: 20,
    rounds: 2,
  });

  const snapshot = conn.prepare('SELECT * FROM token_usage_snapshots WHERE run_id = ?').get(run.id);
  assert.equal(snapshot.file_mtime_ms, 120);
  assert.equal(snapshot.file_size, 240);
  assert.equal(snapshot.stats_ended_at, '2026-06-04T01:04:00.000Z');
  assert.equal(snapshot.input_tokens, 17);
  assert.equal(snapshot.output_tokens, 11);
  assert.equal(snapshot.cached_tokens, 6);
  assert.equal(snapshot.reasoning_tokens, 3);
  assert.equal(snapshot.tool_tokens, 4);
  assert.equal(snapshot.total_tokens, 41);
  assert.equal(snapshot.rounds, 3);
});

test('getAssignedTotals aggregates multiple model runs for the same provider session', () => {
  const { repo } = createRepo();
  const first = startRun(repo, { modelName: 'kimi-k2', envFingerprint: 'fp-kimi' });
  const second = startRun(repo, {
    modelName: 'claude-sonnet',
    envFingerprint: 'fp-sonnet',
    runStartedAt: '2026-06-04T02:00:00.000Z',
  });

  repo.addSnapshotDelta(first.id, {
    inputTokens: 100,
    outputTokens: 40,
    cachedTokens: 10,
    reasoningTokens: 5,
    toolTokens: 3,
    totalTokens: 158,
    rounds: 2,
  });
  repo.addSnapshotDelta(second.id, {
    inputTokens: 30,
    outputTokens: 20,
    cachedTokens: 4,
    reasoningTokens: 6,
    toolTokens: 2,
    totalTokens: 62,
    rounds: 1,
  });

  assert.deepEqual(
    repo.getAssignedTotals({
      provider: 'claude',
      providerSessionId: 'provider-session-1',
    }),
    {
      inputTokens: 130,
      outputTokens: 60,
      cachedTokens: 14,
      reasoningTokens: 11,
      toolTokens: 5,
      totalTokens: 220,
      rounds: 3,
    },
  );
});

test('getLastFingerprint returns latest run snapshot file fingerprint', () => {
  const { repo } = createRepo();
  const first = startRun(repo, {
    envFingerprint: 'env-first',
    runStartedAt: '2026-06-04T01:00:00.000Z',
  });
  const latest = startRun(repo, {
    envFingerprint: 'env-latest',
    runStartedAt: '2026-06-04T02:00:00.000Z',
  });
  repo.addSnapshotDelta(first.id, { fileMtimeMs: 100, fileSize: 200, totalTokens: 10 });
  repo.addSnapshotDelta(latest.id, { fileMtimeMs: 300, fileSize: 400, totalTokens: 20 });

  assert.equal(
    repo.getLastFingerprint({
      provider: 'claude',
      providerSessionId: 'provider-session-1',
    }),
    '300:400',
  );
});

test('getLastFingerprint returns empty string when latest run has no snapshot', () => {
  const { repo } = createRepo();
  const first = startRun(repo, {
    runStartedAt: '2026-06-04T01:00:00.000Z',
  });
  startRun(repo, {
    envFingerprint: 'env-latest-without-snapshot',
    runStartedAt: '2026-06-04T02:00:00.000Z',
  });
  repo.addSnapshotDelta(first.id, { fileMtimeMs: 100, fileSize: 200, totalTokens: 10 });

  assert.equal(
    repo.getLastFingerprint({
      provider: 'claude',
      providerSessionId: 'provider-session-1',
    }),
    '',
  );
});

test('getLastFingerprint returns empty string for negative snapshot file values', () => {
  const { conn, repo } = createRepo();
  const run = startRun(repo);
  conn
    .prepare(
      `INSERT INTO token_usage_snapshots (
        run_id, file_mtime_ms, file_size, updated_at
      ) VALUES (?, ?, ?, ?)`,
    )
    .run(run.id, -100, 200, '2026-06-04T00:00:00.000Z');

  assert.equal(
    repo.getLastFingerprint({
      provider: 'claude',
      providerSessionId: 'provider-session-1',
    }),
    '',
  );
});

test('getSummary returns models ordered by totalTokens descending with camelCase fields', () => {
  const { repo } = createRepo();
  const small = startRun(repo, { modelName: 'small-model', profileName: 'Small' });
  const large = startRun(repo, {
    modelName: 'large-model',
    profileName: 'Large',
    apiBaseHost: 'api.example.com',
    runStartedAt: '2026-06-04T02:00:00.000Z',
  });
  repo.addSnapshotDelta(small.id, { totalTokens: 50, inputTokens: 40, outputTokens: 10, rounds: 1 });
  repo.addSnapshotDelta(large.id, { totalTokens: 120, inputTokens: 80, outputTokens: 40, rounds: 2 });

  const summary = repo.getSummary({ range: 'all' });

  assert.deepEqual(summary.models, [
    {
      provider: 'claude',
      modelName: 'large-model',
      profileName: 'Large',
      apiBaseHost: 'api.example.com',
      runCount: 1,
      totalTokens: 120,
    },
    {
      provider: 'claude',
      modelName: 'small-model',
      profileName: 'Small',
      apiBaseHost: 'api.moonshot.cn',
      runCount: 1,
      totalTokens: 50,
    },
  ]);
});

test('getSummary status respects project provider and model filters', () => {
  const { repo } = createRepo();
  const matchingRunning = startRun(repo, {
    projectId: 'project-1',
    provider: 'claude',
    modelName: 'target-model',
    runStartedAt: '2026-06-04T01:00:00.000Z',
  });
  const matchingFinished = startRun(repo, {
    projectId: 'project-1',
    provider: 'claude',
    modelName: 'target-model',
    runStartedAt: '2026-06-04T02:00:00.000Z',
  });
  const otherProjectRunning = startRun(repo, {
    projectId: 'project-2',
    provider: 'claude',
    modelName: 'target-model',
    runStartedAt: '2026-06-04T03:00:00.000Z',
  });
  const otherModelFinished = startRun(repo, {
    projectId: 'project-1',
    provider: 'claude',
    modelName: 'other-model',
    runStartedAt: '2026-06-04T04:00:00.000Z',
  });
  const otherProviderFinished = startRun(repo, {
    projectId: 'project-1',
    provider: 'codex',
    modelName: 'target-model',
    runStartedAt: '2026-06-04T05:00:00.000Z',
  });

  repo.finishRun(matchingFinished.id, '2026-06-04T02:30:00.000Z');
  repo.finishRun(otherModelFinished.id, '2026-06-04T04:30:00.000Z');
  repo.finishRun(otherProviderFinished.id, '2026-06-04T05:30:00.000Z');
  repo.addSnapshotDelta(matchingRunning.id, { totalTokens: 10 });
  repo.addSnapshotDelta(matchingFinished.id, { totalTokens: 20 });
  repo.addSnapshotDelta(otherProjectRunning.id, { totalTokens: 30 });
  repo.addSnapshotDelta(otherModelFinished.id, { totalTokens: 40 });
  repo.addSnapshotDelta(otherProviderFinished.id, { totalTokens: 50 });

  const summary = repo.getSummary({
    range: 'all',
    projectId: 'project-1',
    provider: 'claude',
    modelName: 'target-model',
  });

  assert.deepEqual(summary.status, {
    running: 1,
    lastFinishedAt: '2026-06-04T02:30:00.000Z',
  });
});
