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

test('auto-response chooses Yes for claude API key environment prompt', () => {
  const service = new PtyService();
  const { meta, writes } = createMeta('claude');
  const promptText = `
Detected a custom API key in your environment
Do you want to use this API key?
1. Yes
2. No (recommended)
Enter to confirm · Esc to cancel
`;

  service.buffers.set(meta.sessionId, promptText);
  service.sessions.set(meta.sessionId, meta);
  service.handleAutoResponses(meta);

  assert.deepEqual(writes, ['\x1b[A\r']);
  assert.equal(meta.autoResponses.has('claude-api-key-confirm'), true);
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
