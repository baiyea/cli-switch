const test = require('node:test');
const assert = require('node:assert/strict');
const { NO_BINDING_TEXT, createImSessionRouter } = require('./im-session-router');

const BASE_SESSION = {
  dbSessionId: 12,
  sessionId: 's-12',
  title: 'claude-01',
  provider: 'claude',
  status: 'running',
  isArchived: false,
  projectName: 'cli-switch',
  updatedAt: '2026-06-09T12:00:00.000Z',
  latestAssistantText: '这是最后一次大模型回复内容，用于远程确认当前会话状态。',
};

function createHarness(options = {}) {
  const writes = [];
  const bindings = new Map();
  if (options.initialBinding) {
    bindings.set(options.initialBinding.imUserId, options.initialBinding);
  }
  const sessions = new Map((options.sessions || [BASE_SESSION]).map((session) => [session.dbSessionId, session]));
  const groups = options.groups === undefined
    ? [{ projectName: 'cli-switch', sessions: Array.from(sessions.values()) }]
    : options.groups;
  const writable = options.writable === undefined ? true : options.writable;
  const writeResult = options.writeResult === undefined ? true : options.writeResult;
  const maybeAsync = (value) => (options.asyncMocks ? Promise.resolve(value) : value);
  const router = createImSessionRouter({
    platform: 'feishu',
    bindingRepository: {
      getBinding: ({ imUserId }) => maybeAsync(bindings.get(imUserId) || null),
      setBinding: ({ imUserId, sessionId, sessionDbId }) => maybeAsync(
        bindings.set(imUserId, { platform: 'feishu', imUserId, sessionId, sessionDbId }),
      ),
    },
    sessionPort: {
      listProjectsWithRecentSessions: () => maybeAsync(groups),
      getSessionByDbId: (id) => maybeAsync(sessions.get(id) || null),
      getSessionById: (id) => maybeAsync(Array.from(sessions.values()).find((s) => s.sessionId === id) || null),
      isSessionWritable: () => maybeAsync(writable),
      writeSessionInput: (sessionId, data) => {
        writes.push({ sessionId, data });
        return maybeAsync(writeResult);
      },
    },
  });
  return { router, writes };
}

test('/list formats recent sessions and star binding', async () => {
  const { router } = createHarness();
  await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'list' } });
  assert.equal(result.ok, true);
  assert.match(result.text, /项目：cli-switch/);
  assert.match(result.text, /★ \[12\] claude-01 · claude · running/);
  assert.match(result.text, /最后回复：这是最后一次大模型回复内容/);
});

test('invalid command returns reason', async () => {
  const { router } = createHarness();
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'invalid', reason: 'bad-command' } });
  assert.deepEqual(result, { ok: false, text: '命令无效：bad-command' });
});

test('/list empty groups returns empty state', async () => {
  const { router } = createHarness({ groups: [] });
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'list' } });
  assert.deepEqual(result, { ok: true, text: '暂无可用会话。请先在桌面端创建会话。' });
});

test('normal text requires binding', async () => {
  const { router } = createHarness();
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'send', text: '继续' } });
  assert.deepEqual(result, {
    ok: false,
    text: NO_BINDING_TEXT,
  });
});

test('/use binds existing session', async () => {
  const { router } = createHarness();
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });
  assert.equal(result.ok, true);
  assert.match(result.text, /已绑定 \[12\] claude-01/);
  assert.match(result.text, /最后回复：\n这是最后一次大模型回复内容，用于远程确认当前会话状态。/);
});

test('/use without args shows current binding detail with latest assistant reply', async () => {
  const { router } = createHarness();
  await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });

  const result = await router.handleCommand({
    imUserId: 'ou_1',
    command: { type: 'showBinding' },
  });

  assert.equal(result.ok, true);
  assert.match(result.text, /当前绑定 \[12\] claude-01/);
  assert.match(result.text, /最后回复：\n这是最后一次大模型回复内容，用于远程确认当前会话状态。/);
});

test('/use rejects missing session', async () => {
  const { router } = createHarness();
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 99 } });
  assert.deepEqual(result, { ok: false, text: '未找到可用会话：99' });
});

test('/use rejects archived session', async () => {
  const { router } = createHarness({ sessions: [{ ...BASE_SESSION, isArchived: true }] });
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });
  assert.deepEqual(result, { ok: false, text: '未找到可用会话：12' });
});

test('showBinding returns no binding text for stale binding', async () => {
  const { router } = createHarness({
    sessions: [],
    initialBinding: { platform: 'feishu', imUserId: 'ou_1', sessionId: 'stale-session', sessionDbId: 12 },
  });
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'showBinding' } });
  assert.deepEqual(result, { ok: false, text: NO_BINDING_TEXT });
});

test('bound normal text writes with carriage return', async () => {
  const { router, writes } = createHarness();
  await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'send', text: 'pnpm build' } });
  assert.equal(result.ok, true);
  assert.deepEqual(writes, [{ sessionId: 's-12', data: 'pnpm build\r' }]);
});

test('bound send rejects non-writable session', async () => {
  const { router, writes } = createHarness({ writable: false });
  await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'send', text: '继续' } });
  assert.deepEqual(result, {
    ok: false,
    text: '会话不可写，请先在桌面端打开或恢复：[12] claude-01 · claude · running',
  });
  assert.deepEqual(writes, []);
});

test('bound send returns write failure', async () => {
  const { router, writes } = createHarness({ writeResult: false });
  await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });
  const result = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'send', text: '继续' } });
  assert.deepEqual(result, {
    ok: false,
    text: '写入失败：[12] claude-01 · claude · running',
  });
  assert.deepEqual(writes, [{ sessionId: 's-12', data: '继续\r' }]);
});

test('bindAndSend binds then writes with carriage return', async () => {
  const { router, writes } = createHarness();
  const result = await router.handleCommand({
    imUserId: 'ou_1',
    command: { type: 'bindAndSend', dbSessionId: 12, text: 'message' },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(writes, [{ sessionId: 's-12', data: 'message\r' }]);
});

test('async repository and port mocks are supported', async () => {
  const { router, writes } = createHarness({ asyncMocks: true });
  const bindResult = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'bind', dbSessionId: 12 } });
  assert.equal(bindResult.ok, true);

  const listResult = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'list' } });
  assert.equal(listResult.ok, true);
  assert.match(listResult.text, /★ \[12\] claude-01 · claude · running/);

  const sendResult = await router.handleCommand({ imUserId: 'ou_1', command: { type: 'send', text: 'async message' } });
  assert.equal(sendResult.ok, true);
  assert.deepEqual(writes, [{ sessionId: 's-12', data: 'async message\r' }]);
});
