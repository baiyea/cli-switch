const test = require('node:test');
const assert = require('node:assert/strict');
const { LarkAdapter } = require('./lark.adapter');

function createFakeLark() {
  const calls = [];
  let messageHandler = null;
  class Client {
    constructor(options) {
      calls.push(['Client', options]);
    }

    async request(payload) {
      calls.push(['request', payload]);
      return { code: 0, data: { message_id: 'om_1' } };
    }
  }

  class EventDispatcher {
    constructor(options) {
      calls.push(['EventDispatcher', options]);
    }

    register(handles) {
      const eventName = Object.keys(handles)[0];
      calls.push(['register', eventName]);
      messageHandler = handles[eventName];
      return this;
    }
  }

  class WSClient {
    constructor(options) {
      calls.push(['WSClient', options]);
    }

    async start(payload) {
      calls.push(['wsStart', payload]);
    }

    close(payload) {
      calls.push(['wsClose', payload]);
    }
  }

  return {
    calls,
    emitTextMessage: async (event) => messageHandler?.(event),
    module: {
      Client,
      EventDispatcher,
      WSClient,
      AppType: { SelfBuild: 'SelfBuild' },
      Domain: { Feishu: 'feishu-domain', Lark: 'lark-domain' },
      EventType: { ImMessageReceiveV1: 'im.message.receive_v1' },
    },
  };
}

test('starts websocket client and registers private message receive handler', async () => {
  const fake = createFakeLark();
  const logs = [];
  const adapter = new LarkAdapter({
    config: { domain: 'feishu', appId: 'cli_a', appSecret: 'secret' },
    onPrivateMessage: async () => ({ ok: true, text: 'ok' }),
    loadLarkSdk: async () => fake.module,
    logInfo: (scope, message, meta) => logs.push({ scope, message, meta }),
  });

  await adapter.start();

  assert.equal(adapter.running, true);
  assert.equal(fake.calls.some((call) => call[0] === 'Client'), true);
  assert.equal(fake.calls.some((call) => call[0] === 'WSClient'), true);
  assert.equal(fake.calls.some((call) => call[0] === 'register' && call[1] === 'im.message.receive_v1'), true);
  assert.equal(fake.calls.some((call) => call[0] === 'wsStart'), true);
  assert.equal(logs.some((entry) => entry.message === 'Lark adapter websocket started'), true);
});

test('routes received private text and sends handler reply back to sender', async () => {
  const fake = createFakeLark();
  const handled = [];
  const logs = [];
  const adapter = new LarkAdapter({
    config: { domain: 'feishu', appId: 'cli_a', appSecret: 'secret' },
    onPrivateMessage: async (message) => {
      handled.push(message);
      return { ok: true, text: '项目列表' };
    },
    loadLarkSdk: async () => fake.module,
    logInfo: (scope, message, meta) => logs.push({ scope, message, meta }),
  });

  await adapter.start();
  await fake.emitTextMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_1', user_id: 'u_1' } },
      message: {
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '/list' }),
      },
    },
  });

  assert.deepEqual(handled, [{ imUserId: 'ou_1', text: '/list' }]);
  assert.equal(
    fake.calls.some(
      (call) =>
        call[0] === 'request' &&
        call[1].method === 'POST' &&
        call[1].url === '/open-apis/im/v1/messages' &&
        call[1].data.receive_id === 'ou_1' &&
        call[1].data.msg_type === 'text' &&
        call[1].data.content === JSON.stringify({ text: '项目列表' }),
    ),
    true,
  );
  assert.equal(logs.some((entry) => entry.message === 'Lark adapter private message received'), true);
  assert.equal(logs.some((entry) => entry.message === 'Lark adapter private reply sent'), true);
});

test('ignores non-p2p message but logs the reason', async () => {
  const fake = createFakeLark();
  const logs = [];
  const handled = [];
  const adapter = new LarkAdapter({
    config: { domain: 'feishu', appId: 'cli_a', appSecret: 'secret' },
    onPrivateMessage: async (message) => {
      handled.push(message);
      return { ok: true, text: 'ok' };
    },
    loadLarkSdk: async () => fake.module,
    logInfo: (scope, message, meta) => logs.push({ scope, message, meta }),
  });

  await adapter.start();
  await fake.emitTextMessage({
    event: {
      sender: { sender_id: { open_id: 'ou_1' } },
      message: { chat_type: 'group', message_type: 'text', content: JSON.stringify({ text: '/list' }) },
    },
  });

  assert.deepEqual(handled, []);
  assert.equal(logs.some((entry) => entry.message === 'Lark adapter message ignored'), true);
});
