const test = require('node:test');
const assert = require('node:assert/strict');

const { createTokenUsageSyncService } = require('./token-usage-sync.service');

function createDeps(overrides = {}) {
  const files = new Map();
  const runs = [];
  const snapshots = [];
  const rows = overrides.rows || [
    {
      id: 'session-1',
      project_id: 'project-1',
      provider: 'claude',
      provider_session_id: 'provider-session-1',
      session_file_path: '/tmp/session.jsonl',
      updated_at: '2026-06-04T01:00:00.000Z',
    },
  ];
  const activeRows = overrides.activeRows || rows;
  const archivedRows = overrides.archivedRows || [];
  const assignedTotals = overrides.assignedTotals || {};
  const fingerprints = overrides.fingerprints || {};
  const statsByPath = overrides.statsByPath || {};
  let runSeq = 0;

  for (const file of overrides.files || []) files.set(file.path, file);

  const deps = {
    fs: {
      existsSync(filePath) {
        return files.has(filePath);
      },
      statSync(filePath) {
        const file = files.get(filePath);
        if (!file) {
          const error = new Error('ENOENT');
          error.code = 'ENOENT';
          throw error;
        }
        return {
          mtimeMs: file.mtimeMs,
          size: file.size,
        };
      },
    },
    sessionStore: {
      listAllActive() {
        return activeRows;
      },
      listAllArchived() {
        return archivedRows;
      },
      getByProviderSessionId({ provider, providerSessionId }) {
        return rows.find(
          (row) => row.provider === provider && row.provider_session_id === providerSessionId,
        );
      },
    },
    tokenUsageStore: {
      getActiveRunByProviderSession({ provider, providerSessionId }) {
        return runs.find(
          (run) =>
            run.provider === provider &&
            run.provider_session_id === providerSessionId &&
            run.run_ended_at == null,
        );
      },
      startRun(payload) {
        const run = {
          id: `run-${++runSeq}`,
          project_id: payload.projectId,
          session_id: payload.sessionId,
          provider: payload.provider,
          provider_session_id: payload.providerSessionId,
          profile_id: payload.profileId,
          profile_name: payload.profileName,
          model_name: payload.modelName,
          api_base_host: payload.apiBaseHost,
          env_fingerprint: payload.envFingerprint,
          session_file_path: payload.sessionFilePath,
          run_started_at: payload.runStartedAt,
          run_ended_at: null,
        };
        runs.push(run);
        return run;
      },
      finishRun(runId, endedAt) {
        const run = runs.find((item) => item.id === runId);
        if (!run) return null;
        run.run_ended_at = endedAt;
        return run;
      },
      addSnapshotDelta(runId, delta) {
        snapshots.push({ runId, delta });
        fingerprints[runId] = `${delta.fileMtimeMs || 0}:${delta.fileSize || 0}`;
        return { run_id: runId, ...delta };
      },
      getAssignedTotals({ provider, providerSessionId }) {
        const key = `${provider}:${providerSessionId}`;
        return assignedTotals[key] || {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          toolTokens: 0,
          totalTokens: 0,
          rounds: 0,
        };
      },
      getLastFingerprint({ provider, providerSessionId }) {
        const run = [...runs]
          .reverse()
          .find((item) => item.provider === provider && item.provider_session_id === providerSessionId);
        return run ? fingerprints[run.id] || '' : '';
      },
    },
    readSessionStats({ row }) {
      const value = statsByPath[row.session_file_path];
      if (value instanceof Error) throw value;
      return value;
    },
    resolveRunMetadata(provider) {
      return {
        provider,
        profileId: 'profile-1',
        profileName: 'Profile One',
        modelName: 'model-one',
        apiBaseHost: 'api.example.com',
        envFingerprint: 'metadata-fingerprint',
      };
    },
    now: () => '2026-06-04T02:00:00.000Z',
    logWarn: () => {},
    rows,
    activeRows,
    archivedRows,
    runs,
    snapshots,
    ...overrides.deps,
  };

  return deps;
}

test('refresh creates unknown run and writes cumulative delta when no active run exists', () => {
  const deps = createDeps({
    files: [{ path: '/tmp/session.jsonl', mtimeMs: 100, size: 200 }],
    statsByPath: {
      '/tmp/session.jsonl': {
        endedAt: 1_780_000_000_000,
        rounds: 2,
        tokens: {
          input: 100,
          output: 50,
          cached: 10,
          reasoning: 5,
          tool: 3,
          total: 168,
        },
      },
    },
  });
  const service = createTokenUsageSyncService(deps);

  const result = service.refresh();

  assert.deepEqual(result, { scanned: 1, updated: 1, skipped: 0, failed: 0 });
  assert.equal(deps.runs[0].model_name, 'unknown');
  assert.equal(deps.runs[0].profile_name, 'unknown');
  assert.equal(deps.snapshots[0].delta.totalTokens, 168);
  assert.equal(deps.snapshots[0].delta.statsEndedAt, new Date(1_780_000_000_000).toISOString());
});

test('syncSession skips unchanged file fingerprint without writing delta', () => {
  const deps = createDeps({
    files: [{ path: '/tmp/session.jsonl', mtimeMs: 100, size: 200 }],
    fingerprints: { 'run-1': '100:200' },
  });
  deps.runs.push({
    id: 'run-1',
    provider: 'claude',
    provider_session_id: 'provider-session-1',
    run_ended_at: null,
  });
  const service = createTokenUsageSyncService(deps);

  const result = service.syncSession(deps.activeRows[0]);

  assert.equal(result.status, 'skipped');
  assert.equal(deps.snapshots.length, 0);
});

test('syncSession writes only positive delta beyond already assigned totals', () => {
  const deps = createDeps({
    files: [{ path: '/tmp/session.jsonl', mtimeMs: 110, size: 210 }],
    assignedTotals: {
      'claude:provider-session-1': {
        inputTokens: 90,
        outputTokens: 40,
        cachedTokens: 10,
        reasoningTokens: 8,
        toolTokens: 1,
        totalTokens: 149,
        rounds: 1,
      },
    },
    statsByPath: {
      '/tmp/session.jsonl': {
        endedAt: null,
        rounds: 3,
        tokens: {
          input: 100,
          output: 45,
          cached: 8,
          reasoning: 11,
          tool: 4,
          total: 168,
        },
      },
    },
  });
  deps.runs.push({
    id: 'run-1',
    provider: 'claude',
    provider_session_id: 'provider-session-1',
    run_ended_at: null,
  });
  const service = createTokenUsageSyncService(deps);

  const result = service.syncSession(deps.activeRows[0], { force: true });

  assert.equal(result.status, 'updated');
  assert.deepEqual(deps.snapshots[0].delta, {
    fileMtimeMs: 110,
    fileSize: 210,
    statsEndedAt: '2026-06-04T01:00:00.000Z',
    inputTokens: 10,
    outputTokens: 5,
    cachedTokens: 0,
    reasoningTokens: 3,
    toolTokens: 3,
    totalTokens: 19,
    rounds: 2,
    sourceMissing: false,
    lastError: '',
  });
});

test('startRunForSession records active model metadata', () => {
  const deps = createDeps();
  const service = createTokenUsageSyncService(deps);

  const run = service.startRunForSession({
    row: deps.activeRows[0],
    startedAt: '2026-06-04T03:00:00.000Z',
  });

  assert.equal(run.model_name, 'model-one');
  assert.equal(run.profile_id, 'profile-1');
  assert.equal(run.profile_name, 'Profile One');
  assert.equal(run.api_base_host, 'api.example.com');
  assert.equal(run.env_fingerprint, 'metadata-fingerprint');
  assert.equal(run.run_started_at, '2026-06-04T03:00:00.000Z');
});

test('refresh marks missing file as sourceMissing and failed', () => {
  const deps = createDeps();
  deps.runs.push({
    id: 'run-1',
    provider: 'claude',
    provider_session_id: 'provider-session-1',
    run_ended_at: null,
  });
  const service = createTokenUsageSyncService(deps);

  const result = service.refresh();

  assert.deepEqual(result, { scanned: 1, updated: 0, skipped: 0, failed: 1 });
  assert.equal(deps.snapshots[0].delta.sourceMissing, true);
  assert.match(deps.snapshots[0].delta.lastError, /missing/);
});

test('parse error persists file fingerprint so unchanged non-force refresh skips retry', () => {
  let readCount = 0;
  const deps = createDeps({
    files: [{ path: '/tmp/session.jsonl', mtimeMs: 123, size: 456 }],
    deps: {
      readSessionStats() {
        readCount += 1;
        throw new Error('bad jsonl');
      },
    },
  });
  const service = createTokenUsageSyncService(deps);

  const first = service.refresh();
  const second = service.refresh();
  const forced = service.refresh({ force: true });

  assert.deepEqual(first, { scanned: 1, updated: 0, skipped: 0, failed: 1 });
  assert.equal(deps.snapshots[0].delta.fileMtimeMs, 123);
  assert.equal(deps.snapshots[0].delta.fileSize, 456);
  assert.deepEqual(second, { scanned: 1, updated: 0, skipped: 1, failed: 0 });
  assert.deepEqual(forced, { scanned: 1, updated: 0, skipped: 0, failed: 1 });
  assert.equal(readCount, 2);
  assert.equal(deps.snapshots.length, 2);
});

test('finishActiveRunByRuntimeSessionId finds and finishes non-claude active run', () => {
  const deps = createDeps({
    rows: [
      {
        id: 'session-2',
        project_id: 'project-1',
        provider: 'codex',
        provider_session_id: 'runtime-1',
        session_file_path: '/tmp/codex.jsonl',
        updated_at: '2026-06-04T01:00:00.000Z',
      },
    ],
    files: [{ path: '/tmp/codex.jsonl', mtimeMs: 100, size: 200 }],
    statsByPath: {
      '/tmp/codex.jsonl': {
        endedAt: 1_780_000_000_000,
        rounds: 1,
        tokens: { input: 1, output: 2, cached: 0, reasoning: 0, tool: 0, total: 3 },
      },
    },
  });
  deps.runs.push({
    id: 'run-codex',
    provider: 'codex',
    provider_session_id: 'runtime-1',
    run_ended_at: null,
  });
  const service = createTokenUsageSyncService(deps);

  const run = service.finishActiveRunByRuntimeSessionId(
    'runtime-1',
    '2026-06-04T04:00:00.000Z',
  );

  assert.equal(run.id, 'run-codex');
  assert.equal(run.run_ended_at, '2026-06-04T04:00:00.000Z');
  assert.equal(deps.snapshots[0].delta.totalTokens, 3);
});
