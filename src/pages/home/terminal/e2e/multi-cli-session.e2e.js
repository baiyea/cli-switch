const path = require('node:path');
const fs = require('node:fs');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function seedProviderSessions(homeDir, projectDir) {
  const claudeSid = '11111111-1111-4111-8111-111111111111';
  const codexSid = '22222222-2222-4222-8222-222222222222';
  const geminiSid = '33333333-3333-4333-8333-333333333333';
  const claudeSubAgentSid = 'agent-a1111111111111111';

  const claudePath = path.join(homeDir, '.claude', 'projects', 'demo', `${claudeSid}.jsonl`);
  ensureDir(path.dirname(claudePath));
  fs.writeFileSync(
    claudePath,
    `${JSON.stringify({ cwd: projectDir, message: { role: 'user', content: 'claude-provider-session' } })}\n`,
    'utf8',
  );
  const claudeSubAgentPath = path.join(
    homeDir,
    '.claude',
    'projects',
    'demo',
    claudeSid,
    'subagents',
    `${claudeSubAgentSid}.jsonl`,
  );
  ensureDir(path.dirname(claudeSubAgentPath));
  fs.writeFileSync(
    claudeSubAgentPath,
    `${JSON.stringify({ cwd: projectDir, message: { role: 'user', content: 'claude-subagent-session' } })}\n`,
    'utf8',
  );

  const codexPath = path.join(homeDir, '.codex', 'sessions', 'demo', `${codexSid}.jsonl`);
  ensureDir(path.dirname(codexPath));
  fs.writeFileSync(
    codexPath,
    `${JSON.stringify({ cwd: projectDir, message: { role: 'user', content: 'codex-provider-session' } })}\n`,
    'utf8',
  );
  const codexDuplicatePath = path.join(homeDir, '.codex', 'sessions', 'demo', 'nested', `${codexSid}.jsonl`);
  ensureDir(path.dirname(codexDuplicatePath));
  fs.writeFileSync(
    codexDuplicatePath,
    `${JSON.stringify({ cwd: projectDir, message: { role: 'user', content: 'codex-provider-session' } })}\n`,
    'utf8',
  );

  const geminiPath = path.join(homeDir, '.gemini', 'tmp', 'demo', 'chats', `${geminiSid}.json`);
  ensureDir(path.dirname(geminiPath));
  fs.writeFileSync(
    geminiPath,
    JSON.stringify({ cwd: projectDir, messages: [{ role: 'user', text: 'gemini-provider-session' }] }),
    'utf8',
  );

  return { claudeSid, codexSid, geminiSid, claudeSubAgentSid };
}

async function launchAppWithFixtures() {
  const ids = {};
  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-multi-cli-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DemoProject',
    providerSettings: {
      providers: {
        claude: {
          defaultProfileId: 'deepseek-api',
          enabledProfileId: 'deepseek-api',
          profiles: [{ id: 'deepseek-api', name: 'DeepSeek API', envVars: [] }],
        },
        codex: {
          defaultProfileId: 'oauth-login',
          enabledProfileId: 'oauth-login',
          profiles: [{ id: 'oauth-login', name: 'OAuth 登录', envVars: [] }],
        },
        gemini: {
          defaultProfileId: 'oauth-login',
          enabledProfileId: 'oauth-login',
          profiles: [{ id: 'oauth-login', name: 'OAuth 登录', envVars: [] }],
        },
      },
    },
    prepareFs: ({ root, projectDir }) => {
      Object.assign(ids, seedProviderSessions(root, projectDir));
    },
  });
  return { ...launched, ids };
}

async function syncFirstProjectHistory(win) {
  const projectNode = win.getByTestId('project-p1');
  await projectNode.locator('.project-create-toggle').click({ force: true });
  await projectNode.getByRole('button', { name: '读取历史会话' }).click({ force: true });
}

async function waitForDiscoveredSessions(win, projectId, sessionIds) {
  await expect
    .poll(
      async () =>
        win.evaluate(async ({ pid, ids }) => {
          const rows = await window.electronAPI.sessions.list({ projectIds: [pid] });
          const idSet = new Set(rows.map((item) => String(item?.sessionId || '')));
          return ids.every((sid) => idSet.has(String(sid || '')));
        }, { pid: projectId, ids: sessionIds }),
      { timeout: 60000, intervals: [300, 600, 1000] },
    )
    .toBe(true);
}

function countOccurrences(text, token) {
  if (!token) return 0;
  return String(text || '').split(token).length - 1;
}

test('multi provider sessions are discovered and resumed by provider', async () => {
  const launched = await launchAppWithFixtures();
  const { electronApp, window: win, ids, root } = launched;
  try {
    await syncFirstProjectHistory(win);
    await waitForDiscoveredSessions(win, 'p1', [ids.claudeSid, ids.codexSid, ids.geminiSid]);

    await expect(win.getByTestId(`session-item-${ids.claudeSid}`)).toBeVisible();
    await expect(win.getByTestId(`session-item-${ids.codexSid}`)).toBeVisible();
    await expect(win.getByTestId(`session-item-${ids.geminiSid}`)).toBeVisible();
    await expect(win.getByTestId(`session-item-${ids.codexSid}`)).toHaveCount(1);
    await expect(win.getByTestId(`session-item-${ids.claudeSubAgentSid}`)).toHaveCount(0);

    await win.getByTestId(`session-item-${ids.codexSid}`).click();
    await expect(win.locator('.toolbar-provider-meta')).toHaveText(/^Codex CLI\s·/);
    await expect(win.locator('.toolbar-session-status')).toBeVisible();
    await expect(win.locator(`[data-session-id="${ids.codexSid}"]`)).toBeVisible();

    await win.getByTestId(`session-item-${ids.geminiSid}`).click();
    await expect(win.locator('.toolbar-provider-meta')).toHaveText(/^Gemini CLI\s·/);
    await expect(win.locator('.toolbar-session-status')).toBeVisible();
    await expect(win.locator(`[data-session-id="${ids.geminiSid}"]`)).toBeVisible();
  } finally {
    await closeApp({ electronApp, root });
  }
});

test('archive and restore uses provider+session archive id', async () => {
  const launched = await launchAppWithFixtures();
  const { electronApp, window: win, root } = launched;
  try {
    await syncFirstProjectHistory(win);
    await waitForDiscoveredSessions(win, 'p1', [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);

    const codexItem = win.getByTestId('session-item-22222222-2222-4222-8222-222222222222');
    await expect(codexItem).toBeVisible();
    await codexItem.click();
    await win.getByRole('button', { name: '归档当前会话' }).click();
    await expect
      .poll(
        async () =>
          win.evaluate(async () => {
            const rows = await window.electronAPI.sessions.list({ projectIds: ['p1'] });
            return rows.some(
              (item) =>
                String(item?.sessionId || '') === '22222222-2222-4222-8222-222222222222',
            );
          }),
        { timeout: 60000, intervals: [300, 600, 1000] },
      )
      .toBe(false);

    await expect(win.getByTestId('session-item-22222222-2222-4222-8222-222222222222')).toHaveCount(0);
    await expect(win.getByTestId('session-item-11111111-1111-4111-8111-111111111111')).toBeVisible();
    await expect(win.getByTestId('session-item-33333333-3333-4333-8333-333333333333')).toBeVisible();

    await win.evaluate(async () => {
      await window.electronAPI.sessions.restore('codex:22222222-2222-4222-8222-222222222222');
    });
    await win.reload();
    await win.waitForLoadState('domcontentloaded');

    await expect(win.getByTestId('session-item-22222222-2222-4222-8222-222222222222')).toBeVisible();
  } finally {
    await closeApp({ electronApp, root });
  }
});

test('switching back and forth does not inject duplicate resume commands', async () => {
  const launched = await launchAppWithFixtures();
  const { electronApp, window: win, ids, root } = launched;
  try {
    await syncFirstProjectHistory(win);
    await waitForDiscoveredSessions(win, 'p1', [ids.claudeSid, ids.codexSid, ids.geminiSid]);

    const codexItem = win.getByTestId(`session-item-${ids.codexSid}`);
    const claudeItem = win.getByTestId(`session-item-${ids.claudeSid}`);
    const geminiItem = win.getByTestId(`session-item-${ids.geminiSid}`);

    await codexItem.click();
    await claudeItem.click();
    await codexItem.click();
    await geminiItem.click();
    await codexItem.click();

    const buffer = await win.evaluate(
      (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
      ids.codexSid,
    );
    const launchToken = 'ELECTRON_RUN_AS_NODE=1';
    expect(countOccurrences(buffer, launchToken)).toBeLessThanOrEqual(1);
  } finally {
    await closeApp({ electronApp, root });
  }
});
