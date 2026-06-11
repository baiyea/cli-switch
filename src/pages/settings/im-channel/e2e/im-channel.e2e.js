const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

const SESSION_ID = 'im-e2e-session-1';
const PROVIDER_SESSION_ID = 'im-e2e-runtime-1';

async function readImChannelStatus(win) {
  return win.evaluate(async () => {
    try {
      return await window.electronAPI.imChannel.status();
    } catch (error) {
      return { ok: false, status: { running: false }, message: String(error) };
    }
  });
}

function createFakeClaudeRuntime(runtimeRoot) {
  const entrypoint = path.join(
    runtimeRoot,
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'cli.js',
  );
  fs.mkdirSync(path.dirname(entrypoint), { recursive: true });
  fs.writeFileSync(
    entrypoint,
    `#!/usr/bin/env node
process.stdout.write('\\r\\nZEELIN_FAKE_CLAUDE_STARTED\\r\\n');
process.stdin.on('data', (chunk) => {
  process.stdout.write('IM_E2E_ECHO:' + String(chunk));
});
process.stdin.resume();
setInterval(() => {}, 1000);
`,
    'utf8',
  );
  fs.chmodSync(entrypoint, 0o755);
}

function seedImChannelDb({ db, now, projectId, projectDir }) {
  db.prepare(`
    INSERT INTO sessions (
      id, project_id, title, provider, provider_session_id, cwd, session_file_path,
      status, sort_order, title_source, last_active_at, created_at, updated_at,
      is_archived, archived_at
    ) VALUES (?, ?, ?, 'claude', ?, ?, NULL, 'exited', 1, 'manual', ?, ?, ?, 0, NULL)
  `).run(SESSION_ID, projectId, 'claude-01', PROVIDER_SESSION_ID, projectDir, now, now, now);

  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
  `).run(
    'im_channel_settings',
    JSON.stringify({
      enabled: true,
      domain: 'feishu',
      appId: 'cli_a',
      appSecret: 'secret',
      allowedUsers: ['ou_1'],
    }),
    now,
  );
}

test('Lark private chat lists, binds, and writes existing session', async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-im-fake-runtime-'));
  createFakeClaudeRuntime(runtimeRoot);

  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-im-channel-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DemoProject',
    seedDb: seedImChannelDb,
    envOverrides: { ZEELIN_CLI_RUNTIME_DIR: runtimeRoot },
  });

  const { electronApp, window: win, root, projectDir } = launched;
  try {
    await expect
      .poll(
        () => readImChannelStatus(win),
        { timeout: 15000, intervals: [200, 400, 800] },
      )
      .toMatchObject({ ok: true, status: { running: true } });

    const hasE2eApi = await win.evaluate(
      () => typeof window.electronAPI.imChannel.simulatePrivateMessage,
    );
    expect(hasE2eApi).toBe('function');

    const listResult = await win.evaluate(() =>
      window.electronAPI.imChannel.simulatePrivateMessage({
        imUserId: 'ou_1',
        text: '/list',
      }),
    );
    expect(listResult.ok).toBe(true);
    expect(listResult.text).toContain('项目：DemoProject');
    expect(listResult.text).toContain('[1] claude-01');

    const started = await win.evaluate(
      ({ projectDir: cwd }) =>
        window.electronAPI.sessions.start({
          sessionId: 'im-e2e-session-1',
          provider: 'claude',
          providerSessionId: 'im-e2e-runtime-1',
          cwd,
          name: 'claude-01',
          initialCols: 80,
          initialRows: 24,
        }),
      { projectDir },
    );
    expect(started.sessionId).toBe(PROVIDER_SESSION_ID);
    expect(started.providerSessionId ?? started.provider_session_id ?? started.sessionId).toBe(
      PROVIDER_SESSION_ID,
    );

    await expect
      .poll(
        () => win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '', PROVIDER_SESSION_ID),
        { timeout: 15000, intervals: [200, 400, 800] },
      )
      .toContain('ZEELIN_FAKE_CLAUDE_STARTED');

    const bindResult = await win.evaluate(() =>
      window.electronAPI.imChannel.simulatePrivateMessage({
        imUserId: 'ou_1',
        text: '/use 1',
      }),
    );
    expect(bindResult.ok).toBe(true);
    expect(bindResult.text).toContain('已绑定 [1] claude-01');

    const sendResult = await win.evaluate(() =>
      window.electronAPI.imChannel.simulatePrivateMessage({
        imUserId: 'ou_1',
        text: 'Write-Output IM_E2E_ECHO',
      }),
    );
    expect(sendResult.ok).toBe(true);
    expect(sendResult.text).toMatch(/已发送到\s*\[1\]\s*claude-01/);

    await expect
      .poll(
        () => win.evaluate((sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '', PROVIDER_SESSION_ID),
        { timeout: 15000, intervals: [200, 400, 800] },
      )
      .toContain('IM_E2E_ECHO');
  } finally {
    await closeApp({ electronApp, root });
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
