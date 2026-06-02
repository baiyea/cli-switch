const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { listProviderSessions } = require('./session-sources');

function writeCodexSession(homeDir, sessionId, cwd, events) {
  const filePath = path.join(
    homeDir,
    '.codex',
    'sessions',
    '2026',
    '05',
    '29',
    `rollout-2026-05-29T10-00-00-${sessionId}.jsonl`,
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    { type: 'session_meta', payload: { id: sessionId, cwd } },
    ...events,
  ].map((item) => JSON.stringify(item));
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
  return filePath;
}

test('Codex session title is derived from event_msg user_message content', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sources-'));
  const cwd = path.join(homeDir, 'project');
  fs.mkdirSync(cwd, { recursive: true });
  const sessionId = '019e3a06-d250-7fb2-80ae-b3d0c330e385';

  writeCodexSession(homeDir, sessionId, cwd, [
    {
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: '实现 session 标题自动修复，不覆盖手动标题',
      },
    },
  ]);

  const sessions = listProviderSessions(homeDir);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].provider, 'codex');
  assert.equal(sessions[0].providerSessionId, sessionId);
  assert.equal(sessions[0].name, '实现 session 标题自动修复，不覆盖手动标题');
  assert.equal(sessions[0].titleSource, 'derived');
});

test('Codex fallback title includes enough session id characters to avoid UUIDv7 prefix collisions', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sources-'));
  const cwd = path.join(homeDir, 'project');
  fs.mkdirSync(cwd, { recursive: true });
  const sessionId = '019e3a06-d250-7fb2-80ae-b3d0c330e385';

  writeCodexSession(homeDir, sessionId, cwd, []);

  const sessions = listProviderSessions(homeDir);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].name, 'session-019e3a06-d250');
  assert.equal(sessions[0].titleSource, 'auto');
});
