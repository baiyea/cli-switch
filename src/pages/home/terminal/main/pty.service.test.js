const test = require('node:test');
const assert = require('node:assert/strict');

const { PtyService } = require('./pty.service');

function createMeta(provider = 'claude') {
  const writes = [];
  return {
    meta: {
      sessionId: 'sid-1',
      provider,
      autoResponses: new Set(),
      pty: {
        write(data) {
          writes.push(data);
        },
      },
    },
    writes,
  };
}

test('auto-response chooses Yes with terminal navigation for claude API key environment prompt', () => {
  const service = new PtyService();
  const { meta, writes } = createMeta('claude');
  const promptText = `
Detected a custom API key in your environment
Do you want to use this API key?
1. Yes
2. No (recommended) ✓
Enter to confirm · Esc to cancel
`;

  service.buffers.set(meta.sessionId, promptText);
  service.sessions.set(meta.sessionId, meta);
  service.handleAutoResponses(meta);

  assert.deepEqual(writes, ['\x1b[A\r']);
  assert.equal(meta.autoResponses.has('claude-api-key-confirm'), true);
});

test('auto-response retries claude API key confirmation when prompt remains visible', async () => {
  const service = new PtyService();
  const { meta, writes } = createMeta('claude');
  const promptText = `
Detected a custom API key in your environment
Do you want to use this API key?
1. Yes
2. No (recommended) ✓
Enter to confirm · Esc to cancel
`;

  service.buffers.set(meta.sessionId, promptText);
  service.sessions.set(meta.sessionId, meta);
  service.handleAutoResponses(meta);

  assert.deepEqual(writes, ['\x1b[A\r']);
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.deepEqual(writes, ['\x1b[A\r', '\x1b[A\r']);
});

test('auto-response does not trigger API key confirmation on non-claude provider', () => {
  const service = new PtyService();
  const { meta, writes } = createMeta('codex');
  const promptText = `
Detected a custom API key in your environment
Do you want to use this API key?
1. Yes
2. No (recommended)
`;

  service.buffers.set(meta.sessionId, promptText);
  service.sessions.set(meta.sessionId, meta);
  service.handleAutoResponses(meta);

  assert.deepEqual(writes, []);
  assert.equal(meta.autoResponses.has('claude-api-key-confirm'), false);
});

test('auto-response waits for full API key confirmation prompt before writing', () => {
  const service = new PtyService();
  const { meta, writes } = createMeta('claude');
  const partialPromptText = `
Detected a custom API key in your environment
`;

  service.buffers.set(meta.sessionId, partialPromptText);
  service.sessions.set(meta.sessionId, meta);
  service.handleAutoResponses(meta);

  assert.deepEqual(writes, []);
  assert.equal(meta.autoResponses.has('claude-api-key-confirm'), false);
});

test('pty service logs write metadata without exposing input content', () => {
  const infos = [];
  const writes = [];
  const service = new PtyService({
    logInfo(scope, message, meta) {
      infos.push({ scope, message, meta });
    },
  });
  service.sessions.set('sid-logs', {
    sessionId: 'sid-logs',
    provider: 'claude',
    pty: {
      write(data) {
        writes.push(data);
      },
    },
  });
  service.buffers.set('sid-logs', 'existing-output');

  assert.equal(service.write('sid-logs', 'secret command with token\n'), true);

  assert.deepEqual(writes, ['secret command with token\n']);
  assert.equal(infos.length, 1);
  assert.equal(infos[0].scope, 'pty');
  assert.equal(infos[0].message, 'PTY input written');
  assert.equal(infos[0].meta.sessionId, 'sid-logs');
  assert.equal(infos[0].meta.dataLength, 'secret command with token\n'.length);
  assert.equal(Object.values(infos[0].meta).includes('secret command with token\n'), false);
});

test('pty service logs snapshot metadata with buffer length', () => {
  const infos = [];
  const service = new PtyService({
    logInfo(scope, message, meta) {
      infos.push({ scope, message, meta });
    },
  });
  service.sessions.set('sid-snapshot', {
    sessionId: 'sid-snapshot',
    provider: 'codex',
  });
  service.buffers.set('sid-snapshot', 'abc123');

  const snapshot = service.getSnapshot('sid-snapshot');

  assert.deepEqual(snapshot, { sessionId: 'sid-snapshot', data: 'abc123' });
  assert.equal(infos.length, 1);
  assert.equal(infos[0].message, 'PTY snapshot read');
  assert.deepEqual(infos[0].meta, {
    sessionId: 'sid-snapshot',
    provider: 'codex',
    hasSession: true,
    bufferLength: 6,
  });
});
