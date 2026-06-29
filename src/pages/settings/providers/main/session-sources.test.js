const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isIgnoredProviderSessionFile, listProviderSessions } = require('./session-sources');

function writeCodexSession(homeDir, sessionId, cwd, events, metaOverrides = {}) {
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
    { type: 'session_meta', payload: { id: sessionId, cwd, ...metaOverrides } },
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

test('Codex subagent sessions are ignored during discovery', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sources-'));
  const cwd = path.join(homeDir, 'project');
  fs.mkdirSync(cwd, { recursive: true });
  const sessionId = '019e91a3-c4f0-7273-8d1f-9242ca00cc81';

  writeCodexSession(
    homeDir,
    sessionId,
    cwd,
    [
      {
        type: 'event_msg',
        payload: {
          type: 'user_message',
          message: '你是实现子代理。执行 Task 1',
        },
      },
    ],
    {
      thread_source: 'subagent',
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: '019e3a06-d250-7fb2-80ae-b3d0c330e385',
            depth: 1,
            agent_nickname: 'Heisenberg',
            agent_role: 'worker',
          },
        },
      },
    },
  );

  const sessions = listProviderSessions(homeDir);
  assert.equal(sessions.length, 0);
});

test('legacy Codex subagent-style sessions are ignored during discovery', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sources-'));
  const cwd = path.join(homeDir, 'project');
  fs.mkdirSync(cwd, { recursive: true });
  const sessionId = '019e91cf-2060-77c3-98a3-9ae12530cc5c';

  writeCodexSession(homeDir, sessionId, cwd, [
    {
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'Task 4 quality re-review 又发现一个有效 Critical 问题。',
      },
    },
  ]);

  const sessions = listProviderSessions(homeDir);
  assert.equal(sessions.length, 0);
});

test('missing Codex session files with subagent-style titles are ignored for cleanup', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sources-'));
  const missingFile = path.join(homeDir, 'missing-subagent.jsonl');

  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: missingFile,
      row: {
        title: '你是 Task 5 的 spec compliance reviewer。请遵守约束。',
      },
    }),
    true,
  );
  const existingFile = writeCodexSession(homeDir, '019e91aa-076d-7103-93ce-98c88a57e506', homeDir, []);
  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: existingFile,
      row: {
        title: '你是规格符合性 reviewer。必须遵守约束。',
      },
    }),
    true,
  );
  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: missingFile,
      row: {
        title: '你是 Task 1 代码质量审查子代理。不要修改文件。',
      },
    }),
    true,
  );
  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: missingFile,
      row: {
        title: '你是 Senior Code Reviewer，审查 Task 4 的代码质量。',
      },
    }),
    true,
  );
  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: missingFile,
      row: {
        title: '你是规格符合性 reviewer。必须遵守约束。',
      },
    }),
    true,
  );
  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: missingFile,
      row: {
        title: '请对 Task 1 进行 code quality re-review。实现子代理请勿修改文件。',
      },
    }),
    true,
  );
  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: missingFile,
      row: {
        title: 'Task 4 quality re-review 又发现一个有效 Critical 问题。',
      },
    }),
    true,
  );
  assert.equal(
    isIgnoredProviderSessionFile({
      provider: 'codex',
      sessionFilePath: missingFile,
      row: {
        title: '本地产物预览',
      },
    }),
    false,
  );
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
