const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { registerImChannelMain } = require('./block.main');
const { IM_CHANNELS } = require('./shared/im-channel.channels');

const E2E_MESSAGE_CHANNEL = 'settings:im-channel:e2e:message';

function withAppE2e(value, fn) {
  const previous = process.env.APP_E2E;
  if (value === undefined) {
    delete process.env.APP_E2E;
  } else {
    process.env.APP_E2E = value;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.APP_E2E;
    } else {
      process.env.APP_E2E = previous;
    }
  }
}

function createHarness(t, options = {}) {
  const handlers = new Map();
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const settings = {};
  const manager =
    options.manager || {
      async configure(config) {
        return config;
      },
      getStatus() {
        return {
          running: false,
          lastError: '',
          lastInboundAt: null,
          lastOutboundAt: null,
        };
      },
      async simulatePrivateMessage(payload) {
        return { ok: true, text: payload?.text || '' };
      },
    };
  registerImChannelMain({
    registerIpc: (channel, handler) => handlers.set(channel, handler),
    appSettingsStore: options.appSettingsStore || {
      getImChannelSettings() {
        return settings.imChannel || {};
      },
      setImChannelSettings(value) {
        settings.imChannel = value;
        return value;
      },
    },
    db,
    imChannelSessionPort: {
      listProjectsWithRecentSessions: () => [],
      getSessionByDbId: () => null,
      getSessionById: () => null,
      isSessionWritable: () => false,
      writeSessionInput: () => false,
    },
    logInfo: () => {},
    logWarn: () => {},
    logError: () => {},
    createManager: () => manager,
    createInstallService: options.createInstallService,
    app: options.app,
    isPackaged: options.isPackaged,
  });
  return { handlers, settings, manager, db };
}

test('registers get, save, status, test and install IPC handlers', async (t) => {
  const { handlers } = createHarness(t);
  assert.equal(handlers.has(IM_CHANNELS.GET_CONFIG), true);
  assert.equal(handlers.has(IM_CHANNELS.SAVE_CONFIG), true);
  assert.equal(handlers.has(IM_CHANNELS.STATUS), true);
  assert.equal(handlers.has(IM_CHANNELS.TEST_CONNECTION), true);
  assert.equal(handlers.has(IM_CHANNELS.INSTALL_QRCODE), true);
  assert.equal(handlers.has(IM_CHANNELS.INSTALL_POLL), true);
  assert.equal(handlers.has(IM_CHANNELS.VERIFY_CREDENTIALS), true);
});

test('returns without db check when registerIpc is missing', () => {
  assert.equal(registerImChannelMain({}), undefined);
});

test('fails fast when db is not injected', () => {
  assert.throws(
    () =>
      registerImChannelMain({
        registerIpc: () => {},
        appSettingsStore: { getImChannelSettings: () => ({}) },
      }),
    /registerImChannelMain: db is required/,
  );
});

test('fails fast when app settings getter is missing', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  assert.throws(
    () =>
      registerImChannelMain({
        registerIpc: () => {},
        db,
        appSettingsStore: { setImChannelSettings: () => ({}) },
      }),
    /registerImChannelMain: appSettingsStore\.getImChannelSettings is required/,
  );
});

test('fails fast when app settings setter is missing', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  assert.throws(
    () =>
      registerImChannelMain({
        registerIpc: () => {},
        db,
        appSettingsStore: { getImChannelSettings: () => ({}) },
      }),
    /registerImChannelMain: appSettingsStore\.setImChannelSettings is required/,
  );
});

test('does not register E2E message IPC in packaged app even when APP_E2E is enabled', (t) => {
  withAppE2e('1', () => {
    const { handlers } = createHarness(t, { isPackaged: true });
    assert.equal(handlers.has(E2E_MESSAGE_CHANNEL), false);
  });
});

test('registers E2E message IPC only for non-packaged APP_E2E runs', (t) => {
  withAppE2e('1', () => {
    const manager = {
      async configure(config) {
        return config;
      },
      getStatus() {
        return {};
      },
      async simulatePrivateMessage(payload) {
        return { ok: true, text: payload.text };
      },
    };
    const { handlers } = createHarness(t, { isPackaged: false, manager });
    assert.equal(handlers.has(E2E_MESSAGE_CHANNEL), true);
  });
});

test('save normalizes allowed users and enabled config', async (t) => {
  const { handlers } = createHarness(t);
  const result = await handlers.get(IM_CHANNELS.SAVE_CONFIG)(null, {
    enabled: true,
    domain: 'feishu',
    appId: ' cli_a ',
    appSecret: ' secret ',
    allowedUsers: [' ou_1 ', '', 'ou_1'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.config, {
    enabled: true,
    domain: 'feishu',
    appId: 'cli_a',
    appSecret: 'secret',
    allowedUsers: ['ou_1'],
  });
});

test('save returns stable envelope when configure fails', async (t) => {
  const manager = {
    configureCalls: [],
    async configure(config) {
      this.configureCalls.push(config);
      if (this.configureCalls.length > 1) throw new Error('start failed');
      return config;
    },
    getStatus() {
      return {
        running: false,
        lastError: 'start failed',
        lastInboundAt: null,
        lastOutboundAt: null,
      };
    },
  };
  const { handlers } = createHarness(t, { manager });

  const result = await handlers.get(IM_CHANNELS.SAVE_CONFIG)(null, {
    enabled: true,
    appId: 'cli_a',
    appSecret: 'secret',
  });

  assert.equal(result.ok, false);
  assert.equal(result.message, 'start failed');
  assert.equal(result.status.lastError, 'start failed');
  assert.deepEqual(result.config, {
    enabled: true,
    domain: 'feishu',
    appId: 'cli_a',
    appSecret: 'secret',
    allowedUsers: [],
  });
});

test('save configures manager for each save request', async (t) => {
  const manager = {
    configureCalls: [],
    async configure(config) {
      this.configureCalls.push(config);
      return config;
    },
    getStatus() {
      return {
        running: false,
        lastError: '',
        lastInboundAt: null,
        lastOutboundAt: null,
      };
    },
  };
  const { handlers } = createHarness(t, { manager });
  manager.configureCalls.length = 0;

  const first = await handlers.get(IM_CHANNELS.SAVE_CONFIG)(null, {
    enabled: false,
    appId: 'cli_a',
  });
  const second = await handlers.get(IM_CHANNELS.SAVE_CONFIG)(null, {
    enabled: true,
    appId: 'cli_b',
    appSecret: 'secret',
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(manager.configureCalls.length, 2);
  assert.equal(manager.configureCalls[0].appId, 'cli_a');
  assert.equal(manager.configureCalls[1].appId, 'cli_b');
});

test('status returns stable status envelope', async (t) => {
  const status = {
    running: true,
    lastError: '',
    lastInboundAt: 1,
    lastOutboundAt: 2,
  };
  const manager = {
    async configure(config) {
      return config;
    },
    getStatus() {
      return status;
    },
  };
  const { handlers } = createHarness(t, { manager });

  assert.deepEqual(await handlers.get(IM_CHANNELS.STATUS)(), {
    ok: true,
    status,
  });
});

test('install qrcode handler delegates selected domain to install service', async (t) => {
  const installService = {
    startQrcodeCalls: [],
    async startQrcode(payload) {
      this.startQrcodeCalls.push(payload);
      return {
        url: 'https://example.test/qrcode',
        deviceCode: 'device-1',
        interval: 3,
        expireIn: 120,
      };
    },
  };
  const { handlers } = createHarness(t, {
    createInstallService: () => installService,
  });

  const result = await handlers.get(IM_CHANNELS.INSTALL_QRCODE)(null, { domain: 'lark' });

  assert.deepEqual(installService.startQrcodeCalls, [{ isLark: true }]);
  assert.deepEqual(result, {
    ok: true,
    url: 'https://example.test/qrcode',
    deviceCode: 'device-1',
    interval: 3,
    expireIn: 120,
  });
});

test('install poll handler returns credential payload when scan completes', async (t) => {
  const installService = {
    pollCalls: [],
    async poll(deviceCode) {
      this.pollCalls.push(deviceCode);
      return {
        done: true,
        appId: 'cli_a',
        appSecret: 'secret',
        domain: 'feishu',
      };
    },
  };
  const { handlers } = createHarness(t, {
    createInstallService: () => installService,
  });

  const result = await handlers.get(IM_CHANNELS.INSTALL_POLL)(null, { deviceCode: 'device-1' });

  assert.deepEqual(installService.pollCalls, ['device-1']);
  assert.deepEqual(result, {
    ok: true,
    done: true,
    appId: 'cli_a',
    appSecret: 'secret',
    domain: 'feishu',
  });
});

test('verify credentials handler delegates normalized credentials to install service', async (t) => {
  const installService = {
    verifyCalls: [],
    async verifyCredentials(payload) {
      this.verifyCalls.push(payload);
      return { ok: true, message: 'ok' };
    },
  };
  const { handlers } = createHarness(t, {
    createInstallService: () => installService,
  });

  const result = await handlers.get(IM_CHANNELS.VERIFY_CREDENTIALS)(null, {
    appId: ' cli_a ',
    appSecret: ' secret ',
  });

  assert.deepEqual(installService.verifyCalls, [{ appId: 'cli_a', appSecret: 'secret' }]);
  assert.deepEqual(result, { ok: true, message: 'ok' });
});
