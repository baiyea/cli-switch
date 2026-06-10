const test = require('node:test');
const assert = require('node:assert/strict');
const { ImChannelManager } = require('./im-channel.manager');

function flushTasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createManager(options = {}) {
  const warnings = [];
  const logs = [];
  const persistedConfigs = [];
  const manager = new ImChannelManager({
    bindingRepository: options.bindingRepository || {
      getBinding: () => null,
      setBinding: () => {},
    },
    sessionPort: options.sessionPort || {
      listProjectsWithRecentSessions: () => [],
      getSessionByDbId: () => null,
      getSessionById: () => null,
      isSessionWritable: () => false,
      writeSessionInput: () => false,
    },
    logInfo: (...args) => logs.push(args),
    logWarn: (...args) => warnings.push(args),
    createAdapter: options.createAdapter,
    persistConfig:
      options.persistConfig ||
      ((config) => {
        persistedConfigs.push(config);
        return config;
      }),
  });
  return { manager, logs, persistedConfigs, warnings };
}

const enabledConfig = {
  enabled: true,
  domain: 'feishu',
  appId: 'cli_a',
  appSecret: 'secret',
  allowedUsers: ['ou_1'],
};

test('configure cleans up adapter when start fails', async () => {
  const adapter = {
    stopCalls: 0,
    async start() {
      throw new Error('start boom');
    },
    async stop() {
      this.stopCalls += 1;
    },
  };
  const { manager } = createManager({ createAdapter: () => adapter });

  await assert.rejects(manager.configure(enabledConfig), /start boom/);

  assert.equal(adapter.stopCalls, 1);
  assert.equal(manager.adapter, null);
  assert.equal(manager.getStatus().running, false);
  assert.equal(manager.getStatus().lastError, 'start boom');
});

test('configure disabled clears adapter and records stop failure', async () => {
  const adapter = {
    async start() {},
    async stop() {
      throw new Error('stop boom');
    },
  };
  const { manager } = createManager({ createAdapter: () => adapter });
  await manager.configure(enabledConfig);

  await assert.rejects(manager.configure({ enabled: false }), /stop boom/);

  assert.equal(manager.adapter, null);
  assert.equal(manager.getStatus().running, false);
  assert.equal(manager.getStatus().lastError, 'stop boom');
});

test('configure queue continues after start failure', async () => {
  let createCount = 0;
  const { manager } = createManager({
    createAdapter: () => {
      createCount += 1;
      return {
        async start() {
          throw new Error('start boom');
        },
        async stop() {},
      };
    },
  });

  await assert.rejects(manager.configure(enabledConfig), /start boom/);
  const result = await manager.configure({ enabled: false });

  assert.deepEqual(result, {
    enabled: false,
    domain: 'feishu',
    appId: '',
    appSecret: '',
    allowedUsers: [],
  });
  assert.equal(createCount, 1);
  assert.equal(manager.adapter, null);
  assert.equal(manager.getStatus().running, false);
});

test('successful configure resets status timestamps and last error', async () => {
  const { manager } = createManager({
    createAdapter: () => ({
      async start() {},
      async stop() {},
    }),
  });
  manager.status = {
    running: false,
    lastError: 'old error',
    lastInboundAt: 1,
    lastOutboundAt: 2,
  };

  await manager.configure(enabledConfig);

  assert.deepEqual(manager.getStatus(), {
    running: true,
    lastError: '',
    lastInboundAt: null,
    lastOutboundAt: null,
  });
});

test('configure calls are serialized while adapter start is pending', async () => {
  let resolveFirstStart;
  let secondCompleted = false;
  const events = [];
  const { manager } = createManager({
    createAdapter: () => {
      const adapterIndex = events.filter((event) => event === 'create').length + 1;
      events.push('create');
      return {
        async start() {
          events.push(`start-${adapterIndex}`);
          if (adapterIndex === 1) {
            return new Promise((resolve) => {
              resolveFirstStart = resolve;
            });
          }
        },
        async stop() {
          events.push(`stop-${adapterIndex}`);
        },
      };
    },
  });

  const first = manager.configure(enabledConfig);
  await flushTasks();
  assert.deepEqual(events, ['create', 'start-1']);

  const second = manager
    .configure({ ...enabledConfig, appId: 'cli_b' })
    .then(() => {
      secondCompleted = true;
    });
  await flushTasks();

  assert.equal(secondCompleted, false);
  assert.deepEqual(events, ['create', 'start-1']);

  resolveFirstStart();
  await first;
  await second;

  assert.equal(secondCompleted, true);
  assert.deepEqual(events, ['create', 'start-1', 'stop-1', 'create', 'start-2']);
});

test('configure clears router and adapter when createAdapter throws', async () => {
  const { manager } = createManager({
    createAdapter: () => {
      throw new Error('adapter factory boom');
    },
  });

  await assert.rejects(manager.configure(enabledConfig), /adapter factory boom/);

  assert.equal(manager.router, null);
  assert.equal(manager.adapter, null);
  assert.equal(manager.getStatus().running, false);
  assert.equal(manager.getStatus().lastError, 'adapter factory boom');
  assert.equal(
    (await manager.handlePrivateMessage({ imUserId: 'ou_1', text: '/list' })).text,
    'IM Channel 尚未启动。',
  );
});

test('stop failure keeps pending cleanup retry without routing old session', async () => {
  const writes = [];
  const bindingRepository = {
    getBinding: () => ({ platform: 'feishu', imUserId: 'ou_1', sessionId: 's-1', sessionDbId: 1 }),
    setBinding: () => {},
  };
  const sessionPort = {
    listProjectsWithRecentSessions: () => [],
    getSessionByDbId: () => null,
    getSessionById: () => ({
      dbSessionId: 1,
      sessionId: 's-1',
      title: 'old',
      provider: 'claude',
      status: 'running',
      isArchived: false,
    }),
    isSessionWritable: () => true,
    writeSessionInput: (sessionId, data) => {
      writes.push({ sessionId, data });
      return true;
    },
  };
  const adapter = {
    stopCalls: 0,
    async start() {},
    async stop() {
      this.stopCalls += 1;
      if (this.stopCalls === 1) throw new Error('stop boom');
    },
  };
  const { manager } = createManager({
    bindingRepository,
    sessionPort,
    createAdapter: () => adapter,
  });
  await manager.configure(enabledConfig);

  await assert.rejects(manager.configure({ enabled: false }), /stop boom/);

  assert.equal(manager.adapter, null);
  assert.equal(manager.router, null);
  assert.equal(manager.pendingCleanupAdapter, adapter);
  assert.equal(manager.getStatus().running, false);
  assert.equal(manager.getStatus().lastError, 'stop boom');
  assert.equal(
    (await manager.handlePrivateMessage({ imUserId: 'ou_1', text: '继续' })).text,
    'IM Channel 尚未启动。',
  );
  assert.deepEqual(writes, []);

  await manager.configure({ enabled: false });

  assert.equal(adapter.stopCalls, 2);
  assert.equal(manager.pendingCleanupAdapter, null);
  assert.equal(manager.getStatus().running, false);
});

test('start failure keeps pending cleanup when cleanup stop also fails', async () => {
  const adapter = {
    stopCalls: 0,
    async start() {
      throw new Error('start boom');
    },
    async stop() {
      this.stopCalls += 1;
      if (this.stopCalls === 1) throw new Error('cleanup boom');
    },
  };
  const { manager } = createManager({ createAdapter: () => adapter });

  await assert.rejects(manager.configure(enabledConfig), /start boom/);

  assert.equal(adapter.stopCalls, 1);
  assert.equal(manager.adapter, null);
  assert.equal(manager.router, null);
  assert.equal(manager.pendingCleanupAdapter, adapter);
  assert.equal(manager.getStatus().running, false);
  assert.equal(manager.getStatus().lastError, 'start boom');

  await manager.configure({ enabled: false });

  assert.equal(adapter.stopCalls, 2);
  assert.equal(manager.pendingCleanupAdapter, null);
  assert.equal(manager.getStatus().running, false);
});

test('handlePrivateMessage logs inbound, authorization and route result boundaries', async () => {
  const bindingRepository = {
    getBinding: () => null,
    setBinding: () => {},
  };
  const sessionPort = {
    listProjectsWithRecentSessions: () => [
      {
        projectId: 'p-1',
        projectName: 'Demo',
        sessions: [],
      },
    ],
    getSessionByDbId: () => null,
    getSessionById: () => null,
    isSessionWritable: () => false,
    writeSessionInput: () => false,
  };
  const { manager, logs } = createManager({
    bindingRepository,
    sessionPort,
    createAdapter: () => ({
      async start() {},
      async stop() {},
    }),
  });
  await manager.configure(enabledConfig);

  await manager.handlePrivateMessage({ imUserId: 'ou_1', text: '/list' });
  await manager.handlePrivateMessage({ imUserId: 'ou_2', text: '/list' });

  assert.equal(
    logs.some((entry) => entry[0] === 'im-channel' && entry[1] === 'Private message received'),
    true,
  );
  assert.equal(
    logs.some((entry) => entry[0] === 'im-channel' && entry[1] === 'Private message routed'),
    true,
  );
  assert.equal(
    logs.some((entry) => entry[0] === 'im-channel' && entry[1] === 'Private message rejected'),
    true,
  );
});

test('auto trusts first private user when allowlist is empty', async () => {
  const bindingRepository = {
    getBinding: () => null,
    setBinding: () => {},
  };
  const sessionPort = {
    listProjectsWithRecentSessions: () => [
      {
        projectId: 'p-1',
        projectName: 'Demo',
        sessions: [],
      },
    ],
    getSessionByDbId: () => null,
    getSessionById: () => null,
    isSessionWritable: () => false,
    writeSessionInput: () => false,
  };
  const { manager, logs, persistedConfigs } = createManager({
    bindingRepository,
    sessionPort,
    createAdapter: () => ({
      async start() {},
      async stop() {},
    }),
  });
  await manager.configure({ ...enabledConfig, allowedUsers: [] });

  const result = await manager.handlePrivateMessage({
    imUserId: 'ou_first_user',
    text: '/list',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(manager.config.allowedUsers, ['ou_first_user']);
  assert.equal(persistedConfigs.length, 1);
  assert.deepEqual(persistedConfigs[0].allowedUsers, ['ou_first_user']);
  assert.equal(
    logs.some((entry) => entry[0] === 'im-channel' && entry[1] === 'Auto trusted first IM user'),
    true,
  );
});
