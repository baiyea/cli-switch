const test = require('node:test');
const assert = require('node:assert/strict');

const { createOAuthLoginService } = require('./oauth-login-service');

function createBaseDeps(overrides = {}) {
  const calls = {
    ptyCreate: [],
    ptyDestroy: [],
    ptyWrite: [],
    sessionCreate: [],
    sessionUpdate: [],
    sessionRestore: [],
    sessionRename: [],
    trackerRegister: [],
    trackerUnregister: [],
  };

  const project = { id: 'p1', path: '/tmp/workspace' };
  const existingSession = overrides.existingSession || null;

  const deps = {
    normalizeProviderId: (value) => String(value || 'claude').toLowerCase(),
    getOAuthLoginCommandForProvider: () => 'oauth login\n',
    projectStore: {
      getById: (id) => (id === project.id ? project : null),
      list: () => [project],
    },
    sessionStore: {
      getByProviderSessionId: ({ provider, providerSessionId }) => {
        if (
          existingSession &&
          provider === existingSession.provider &&
          providerSessionId === existingSession.provider_session_id
        ) {
          return { ...existingSession };
        }
        return null;
      },
      create: (payload) => calls.sessionCreate.push(payload),
      updateStateByProviderSessionId: (payload) => calls.sessionUpdate.push(payload),
      restoreByProviderSessionId: (payload) => calls.sessionRestore.push(payload),
      renameByProviderSessionId: (payload) => calls.sessionRename.push(payload),
    },
    ptyService: {
      destroy: (sessionId, options) => calls.ptyDestroy.push({ sessionId, options }),
      create: (payload) => calls.ptyCreate.push(payload),
      write: (sessionId, data) => {
        calls.ptyWrite.push({ sessionId, data });
        return true;
      },
    },
    oauthLoginTracker: {
      registerSession: (payload) => calls.trackerRegister.push(payload),
      unregisterSession: (sessionId) => calls.trackerUnregister.push(sessionId),
    },
    logInfo: () => {},
    logWarn: () => {},
    ...overrides,
  };

  return { deps, calls, project };
}

test('oauth login creates fixed provider test session on first run', async () => {
  const { deps, calls, project } = createBaseDeps();
  const service = createOAuthLoginService(deps);

  const result = await service.startProviderOAuthLogin({
    provider: 'codex',
    profileId: 'oauth-login',
    projectId: project.id,
  });

  assert.equal(result.ok, true);
  assert.equal(result.session.sessionId, 'codex-tests');
  assert.equal(result.session.projectId, project.id);

  assert.equal(calls.sessionCreate.length, 1);
  assert.equal(calls.sessionCreate[0].providerSessionId, 'codex-tests');
  assert.equal(calls.sessionCreate[0].title, 'codex-tests');

  assert.equal(calls.ptyDestroy.length, 1);
  assert.deepEqual(calls.ptyDestroy[0], {
    sessionId: 'codex-tests',
    options: { quiet: true },
  });
  assert.equal(calls.ptyCreate.length, 1);
  assert.equal(calls.ptyCreate[0].sessionId, 'codex-tests');
  assert.equal(calls.ptyWrite.length, 1);
  assert.equal(calls.ptyWrite[0].sessionId, 'codex-tests');
  assert.match(calls.ptyWrite[0].data, /oauth login/i);

  assert.equal(calls.sessionUpdate.length, 1);
  assert.deepEqual(calls.sessionUpdate[0], {
    provider: 'codex',
    providerSessionId: 'codex-tests',
    status: 'running',
  });
  assert.deepEqual(calls.trackerUnregister, ['codex-tests']);
  assert.equal(calls.trackerRegister.length, 1);
  assert.equal(calls.trackerRegister[0].sessionId, 'codex-tests');
});

test('oauth login reuses fixed session record and always recreates pty', async () => {
  const existing = {
    id: 's1',
    project_id: 'p-existing',
    provider: 'claude',
    provider_session_id: 'claude-tests',
  };
  const { deps, calls } = createBaseDeps({ existingSession: existing });
  const service = createOAuthLoginService(deps);

  const result = await service.startProviderOAuthLogin({
    provider: 'claude',
    profileId: 'oauth-login',
    projectId: 'p1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.session.sessionId, 'claude-tests');
  assert.equal(result.session.projectId, 'p-existing');

  assert.equal(calls.sessionCreate.length, 0);
  assert.equal(calls.sessionRestore.length, 1);
  assert.deepEqual(calls.sessionRestore[0], {
    provider: 'claude',
    providerSessionId: 'claude-tests',
  });
  assert.equal(calls.sessionRename.length, 1);
  assert.deepEqual(calls.sessionRename[0], {
    provider: 'claude',
    providerSessionId: 'claude-tests',
    title: 'claude-tests',
  });

  assert.equal(calls.ptyDestroy.length, 1);
  assert.equal(calls.ptyDestroy[0].sessionId, 'claude-tests');
  assert.equal(calls.ptyCreate.length, 1);
  assert.equal(calls.ptyCreate[0].sessionId, 'claude-tests');
  assert.equal(calls.ptyWrite.length, 1);
  assert.equal(calls.ptyWrite[0].sessionId, 'claude-tests');
});
