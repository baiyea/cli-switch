const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionDiscoverySyncService } = require('./session-discovery-sync.service');

function createService(overrides = {}) {
  const callbacks = [];
  const warnings = [];
  const service = createSessionDiscoverySyncService({
    mapSessionsToProjects() {
      return [
        {
          projectId: 'project-1',
          name: 'Discovered',
          provider: 'codex',
          providerSessionId: 'real-provider-session',
          cwd: '/tmp/project',
          sessionFilePath: '/tmp/session.jsonl',
          createdAt: Date.parse('2026-06-04T01:00:00.000Z'),
        },
      ];
    },
    listProviderSessions() {
      return [];
    },
    dedupeSessionViews(sessions) {
      return sessions;
    },
    sessionStore: {
      reconcileDiscovered(payload) {
        callbacks.push({ type: 'reconcile', payload });
        return {
          ok: true,
          reconciled: true,
          fromProviderSessionId: 'codex-1780016473299-015422',
          toProviderSessionId: 'real-provider-session',
        };
      },
    },
    normalizeProviderId(provider) {
      return String(provider || '').toLowerCase();
    },
    logWarn(scope, message, meta) {
      warnings.push({ scope, message, meta });
    },
    ...overrides,
  });
  return { service, callbacks, warnings };
}

test('syncDiscoveredSessionsForProjects calls onReconciledSession for provider session id mappings', () => {
  const reconciled = [];
  const { service } = createService({
    onReconciledSession(mapping) {
      reconciled.push(mapping);
    },
  });

  const result = service.syncDiscoveredSessionsForProjects([{ id: 'project-1', path: '/tmp/project' }]);

  assert.equal(result.count, 1);
  assert.deepEqual(result.mappings, [
    {
      provider: 'codex',
      fromProviderSessionId: 'codex-1780016473299-015422',
      toProviderSessionId: 'real-provider-session',
      cwd: '/tmp/project',
      projectId: 'project-1',
    },
  ]);
  assert.deepEqual(reconciled, result.mappings);
});

test('syncDiscoveredSessionsForProjects ignores onReconciledSession failures', () => {
  const { service, warnings } = createService({
    onReconciledSession() {
      throw new Error('token usage unavailable');
    },
  });

  const result = service.syncDiscoveredSessionsForProjects([{ id: 'project-1', path: '/tmp/project' }]);

  assert.equal(result.count, 1);
  assert.equal(result.mappings.length, 1);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].scope, 'session');
  assert.match(warnings[0].message, /reconciled session callback/i);
});

test('archiveIgnoredProviderSessionsForProjects archives active provider subagent rows', () => {
  const archived = [];
  const { service } = createService({
    sessionStore: {
      listActiveWithSessionFileByProject(projectId) {
        assert.equal(projectId, 'project-1');
        return [
          {
            provider: 'codex',
            provider_session_id: 'subagent-session',
            session_file_path: '/tmp/subagent.jsonl',
          },
          {
            provider: 'codex',
            provider_session_id: 'normal-session',
            session_file_path: '/tmp/normal.jsonl',
          },
        ];
      },
      archiveByProviderSessionId(payload) {
        archived.push(payload);
      },
      reconcileDiscovered() {
        return { ok: true, reconciled: false };
      },
    },
    isIgnoredProviderSessionFile({ providerSessionId }) {
      return providerSessionId === 'subagent-session';
    },
  });

  const result = service.archiveIgnoredProviderSessionsForProjects([
    { id: 'project-1', path: '/tmp/project' },
  ]);

  assert.equal(result.count, 1);
  assert.deepEqual(archived, [
    {
      provider: 'codex',
      providerSessionId: 'subagent-session',
    },
  ]);
});
