const test = require('node:test');
const assert = require('node:assert/strict');
const { parseImCommand } = require('./im-command-parser');

test('parses /list', () => {
  assert.deepEqual(parseImCommand('/list'), { type: 'list' });
});

test('parses /use without args', () => {
  assert.deepEqual(parseImCommand('/use'), { type: 'showBinding' });
});

test('parses /use with db session id', () => {
  assert.deepEqual(parseImCommand('/use 12'), { type: 'bind', dbSessionId: 12 });
});

test('parses /use with db session id and message', () => {
  assert.deepEqual(parseImCommand('/use 12 pnpm build'), {
    type: 'bindAndSend',
    dbSessionId: 12,
    text: 'pnpm build',
  });
});

test('parses normal private text as send to current binding', () => {
  assert.deepEqual(parseImCommand('继续'), { type: 'send', text: '继续' });
});

test('rejects invalid db session id', () => {
  assert.deepEqual(parseImCommand('/use abc'), {
    type: 'invalid',
    reason: 'invalid-session-id',
  });
});

test('rejects overlong text', () => {
  const text = 'a'.repeat(4001);
  assert.deepEqual(parseImCommand(text), {
    type: 'invalid',
    reason: 'message-too-long',
  });
});
