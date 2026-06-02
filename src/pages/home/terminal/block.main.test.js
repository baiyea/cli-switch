const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const { TERMINAL_CHANNELS } = require('./shared/terminal.channels');

function loadBlockMainWithFakeElectron() {
  const originalLoad = Module._load;
  const fakeIpcMain = {
    handle() {},
    on() {},
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return { ipcMain: fakeIpcMain };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve('./block.main')];
    return require('./block.main');
  } finally {
    Module._load = originalLoad;
  }
}

function createBaseContext(overrides = {}) {
  const handlers = new Map();
  return {
    handlers,
    context: {
      create() {},
      getSnapshot() {
        return '';
      },
      getSessionMeta() {
        return null;
      },
      write() {
        return true;
      },
      resize() {},
      destroy() {},
      registerIpc(channel, handler) {
        handlers.set(channel, handler);
      },
      sessionStatsSchema: {
        parse(payload) {
          return payload;
        },
      },
      normalizeProviderId(provider) {
        return String(provider || 'claude').toLowerCase();
      },
      ...overrides,
    },
  };
}

test('session stats reconciles a local generated providerSessionId before reading stats', async () => {
  const { registerTerminalMain } = loadBlockMainWithFakeElectron();
  const localRow = {
    id: 'session-row-1',
    project_id: 'project-1',
    provider: 'codex',
    provider_session_id: 'codex-1780016473299-015422',
    cwd: '/tmp/project',
    session_file_path: null,
  };
  const realRow = {
    ...localRow,
    provider_session_id: '019e713f-fee4-7942-bfe0-51ee042b472e',
    session_file_path: '/tmp/session.jsonl',
  };
  const readCalls = [];
  let synced = false;

  const { handlers, context } = createBaseContext({
    projectStore: {
      getById(projectId) {
        assert.equal(projectId, 'project-1');
        return { id: 'project-1', path: '/tmp/project' };
      },
    },
    sessionStore: {
      getByProviderSessionId({ provider, providerSessionId }) {
        assert.equal(provider, 'codex');
        if (providerSessionId === localRow.provider_session_id) return localRow;
        if (providerSessionId === realRow.provider_session_id) return realRow;
        return null;
      },
    },
    isLocalGeneratedSessionId(provider, providerSessionId) {
      return provider === 'codex' && providerSessionId === localRow.provider_session_id;
    },
    syncDiscoveredSessionsForProjects(projects) {
      synced = true;
      assert.deepEqual(projects, [{ id: 'project-1', path: '/tmp/project' }]);
      return {
        count: 1,
        mappings: [
          {
            provider: 'codex',
            fromProviderSessionId: localRow.provider_session_id,
            toProviderSessionId: realRow.provider_session_id,
            cwd: '/tmp/project',
            projectId: 'project-1',
          },
        ],
      };
    },
    readSessionStats(args) {
      readCalls.push(args);
      if (args.providerSessionId === localRow.provider_session_id) {
        throw new Error('still using local generated session id');
      }
      return {
        provider: 'codex',
        providerSessionId: realRow.provider_session_id,
        sourcePath: realRow.session_file_path,
        rounds: 2,
        tokens: { available: true, total: 123 },
      };
    },
  });

  registerTerminalMain(context);
  const handler = handlers.get(TERMINAL_CHANNELS.SESSION_STATS);
  assert.equal(typeof handler, 'function');

  const result = await handler(null, {
    provider: 'codex',
    providerSessionId: localRow.provider_session_id,
  });

  assert.equal(synced, true);
  assert.equal(result.ok, true);
  assert.equal(result.stats.providerSessionId, realRow.provider_session_id);
  assert.equal(readCalls.length, 1);
  assert.equal(readCalls[0].providerSessionId, realRow.provider_session_id);
  assert.equal(readCalls[0].row, realRow);
});

test('session stats refreshes discovered metadata for auto titled provider sessions', async () => {
  const { registerTerminalMain } = loadBlockMainWithFakeElectron();
  const row = {
    id: 'session-row-2',
    project_id: 'project-1',
    provider: 'codex',
    provider_session_id: '019e3a06-d250-7fb2-80ae-b3d0c330e385',
    cwd: '/tmp/project',
    session_file_path: '/tmp/session.jsonl',
    title: 'session-019e3a06-d250',
    title_source: 'auto',
  };
  let synced = false;

  const { handlers, context } = createBaseContext({
    fs: {
      existsSync(filePath) {
        return filePath === row.session_file_path;
      },
    },
    projectStore: {
      getById(projectId) {
        assert.equal(projectId, 'project-1');
        return { id: 'project-1', path: '/tmp/project' };
      },
    },
    sessionStore: {
      getByProviderSessionId({ provider, providerSessionId }) {
        assert.equal(provider, 'codex');
        assert.equal(providerSessionId, row.provider_session_id);
        return row;
      },
    },
    isLocalGeneratedSessionId() {
      return false;
    },
    syncDiscoveredSessionsForProjects(projects) {
      synced = true;
      assert.deepEqual(projects, [{ id: 'project-1', path: '/tmp/project' }]);
      return { count: 1, mappings: [] };
    },
    readSessionStats(args) {
      assert.equal(args.providerSessionId, row.provider_session_id);
      assert.equal(args.row, row);
      return {
        provider: 'codex',
        providerSessionId: row.provider_session_id,
        sourcePath: row.session_file_path,
        rounds: 1,
        tokens: { available: false, total: 0 },
      };
    },
  });

  registerTerminalMain(context);
  const handler = handlers.get(TERMINAL_CHANNELS.SESSION_STATS);
  const result = await handler(null, {
    provider: 'codex',
    providerSessionId: row.provider_session_id,
  });

  assert.equal(result.ok, true);
  assert.equal(synced, true);
});
