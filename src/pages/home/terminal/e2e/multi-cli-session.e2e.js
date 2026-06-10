const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
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
process.stdin.resume();
setInterval(() => {}, 1000);
`,
    'utf8',
  );
  fs.chmodSync(entrypoint, 0o755);
}

async function launchAppWithFixtures(options = {}) {
  const ids = {};
  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: options.rootPrefix || 'cliswitch-multi-cli-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DemoProject',
    envOverrides: options.envOverrides || {},
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

async function waitForTerminalGeometry(win, sessionId) {
  await expect
    .poll(
      async () =>
        win.evaluate((sid) => window.__ZEELIN_TEST__?.getTerminalLayoutGeometry?.(sid), sessionId),
      { timeout: 30000, intervals: [200, 400, 800] },
    )
    .toMatchObject({
      cols: expect.any(Number),
      rows: expect.any(Number),
      cellWidth: expect.any(Number),
      container: expect.any(Object),
      screen: expect.any(Object),
      viewport: expect.any(Object),
    });

  return win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getTerminalLayoutGeometry?.(sid),
    sessionId,
  );
}

function expectTerminalGeometryAligned(geometry, provider) {
  expect(geometry, provider).toBeTruthy();
  expect(geometry.cellWidth, provider).toBeGreaterThan(0);
  expect(geometry.cols, provider).toBeGreaterThan(20);
  expect(geometry.rows, provider).toBeGreaterThan(5);
  expect(geometry.sidebar?.right, provider).toBeLessThanOrEqual(geometry.mainPanel.left + 1);
  expect(geometry.mainContent.left, provider).toBeGreaterThanOrEqual(geometry.sidebar.right - 1);
  expect(geometry.container.left, provider).toBeGreaterThanOrEqual(geometry.mainPanel.left - 1);
  expect(geometry.container.right, provider).toBeLessThanOrEqual(geometry.mainPanel.right + 1);
  expect(geometry.xterm.left, provider).toBeGreaterThanOrEqual(geometry.container.left - 1);
  expect(geometry.viewport.left, provider).toBeGreaterThanOrEqual(geometry.container.left - 1);
  expect(geometry.screen.left, provider).toBeGreaterThanOrEqual(geometry.container.left - 1);
  expect(geometry.screen.right, provider).toBeLessThanOrEqual(
    geometry.container.right + geometry.cellWidth + 2,
  );
  expect(geometry.viewport.scrollWidth, provider).toBeLessThanOrEqual(
    geometry.viewport.clientWidth + geometry.cellWidth + 2,
  );

  const expectedCols = Math.floor(geometry.container.width / geometry.cellWidth);
  expect(geometry.cols, provider).toBeGreaterThanOrEqual(expectedCols - 3);
  expect(geometry.cols, provider).toBeLessThanOrEqual(expectedCols + 1);
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

test('Windows terminal viewport stays aligned with sidebar for Claude and Codex sessions', async () => {
  test.skip(process.platform !== 'win32', 'Windows-only layout regression coverage');

  const launched = await launchAppWithFixtures();
  const { electronApp, window: win, ids, root } = launched;
  try {
    await win.setViewportSize({ width: 1600, height: 900 });
    await syncFirstProjectHistory(win);
    await waitForDiscoveredSessions(win, 'p1', [ids.claudeSid, ids.codexSid]);

    for (const { provider, sessionId, titlePattern } of [
      { provider: 'claude', sessionId: ids.claudeSid, titlePattern: /^Claude Code\s·/ },
      { provider: 'codex', sessionId: ids.codexSid, titlePattern: /^Codex CLI\s·/ },
    ]) {
      await win.getByTestId(`session-item-${sessionId}`).click();
      await expect(win.locator('.toolbar-provider-meta')).toHaveText(titlePattern);
      await expect(win.locator(`[data-session-id="${sessionId}"]`)).toBeVisible();
      await win.evaluate(
        ({ sid, label }) => {
          const rule = `${label}-layout-rule-${'─'.repeat(220)}`;
          window.__ZEELIN_TEST__?.appendTerminalData?.(
            sid,
            `${rule}\r\n${label}-layout-body ${'0123456789 '.repeat(40)}\r\n`,
          );
        },
        { sid: sessionId, label: provider },
      );

      const geometry = await waitForTerminalGeometry(win, sessionId);
      expectTerminalGeometryAligned(geometry, provider);
      const resize = await win.evaluate((sid) => window.__ZEELIN_TEST__?.getLastResize(sid), sessionId);
      expect(resize).toMatchObject({ cols: geometry.cols, rows: geometry.rows });
    }
  } finally {
    await closeApp({ electronApp, root });
  }
});
test('Windows first session selection wakes terminal renderer without switching away', async () => {
  test.skip(process.platform !== 'win32', 'Windows-only terminal wake regression coverage');

  const launched = await launchAppWithFixtures();
  const { electronApp, window: win, ids, root } = launched;
  try {
    await win.setViewportSize({ width: 1600, height: 900 });
    await syncFirstProjectHistory(win);
    await waitForDiscoveredSessions(win, 'p1', [ids.codexSid]);

    await win.getByTestId(`session-item-${ids.codexSid}`).click();
    await expect(win.locator('.toolbar-provider-meta')).toHaveText(/^Codex CLI\s·/);
    await expect(win.locator(`[data-session-id="${ids.codexSid}"]`)).toBeVisible();

    await expect
      .poll(
        async () =>
          win.evaluate((sid) => {
            const geometry = window.__ZEELIN_TEST__?.getTerminalLayoutGeometry?.(sid);
            if (!geometry) return null;
            const pane = document.querySelector(`[data-session-id="${sid}"]`);
            return {
              cols: geometry.cols,
              rows: geometry.rows,
              xtermHeight: geometry.xterm?.height || 0,
              screenHeight: geometry.screen?.height || 0,
              viewportHeight: geometry.viewport?.height || 0,
              focused: Boolean(pane?.querySelector('textarea.xterm-helper-textarea') === document.activeElement),
            };
          }, ids.codexSid),
        { timeout: 30000, intervals: [100, 200, 400, 800] },
      )
      .toMatchObject({
        cols: expect.any(Number),
        rows: expect.any(Number),
        xtermHeight: expect.any(Number),
        screenHeight: expect.any(Number),
        viewportHeight: expect.any(Number),
        focused: true,
      });

    const geometry = await win.evaluate(
      (sid) => window.__ZEELIN_TEST__?.getTerminalLayoutGeometry?.(sid),
      ids.codexSid,
    );
    expect(geometry.cols).toBeGreaterThan(20);
    expect(geometry.rows).toBeGreaterThan(5);
    expect(geometry.xterm.height).toBeGreaterThan(100);
    expect(geometry.screen.height).toBeGreaterThan(100);
    expect(geometry.viewport.height).toBeGreaterThan(100);

    await expect
      .poll(
        () =>
          electronApp.evaluate(() => {
            const metas = globalThis.__ZEELIN_E2E_PTY_SERVICE__?.listSessionMeta?.() || [];
            return metas.find((item) => item?.provider === 'codex') || null;
          }),
        { timeout: 15000, intervals: [200, 400, 800] },
      )
      .toMatchObject({
        provider: 'codex',
        initialCols: expect.any(Number),
        initialRows: expect.any(Number),
      });
  } finally {
    await closeApp({ electronApp, root });
  }
});

test('Windows Codex terminal mouse wheel scrolls after TUI enables mouse tracking', async () => {
  test.skip(process.platform !== 'win32', 'Windows-only Codex scroll regression coverage');

  const launched = await launchAppWithFixtures();
  const { electronApp, window: win, ids, root } = launched;
  try {
    await win.setViewportSize({ width: 1600, height: 900 });
    await syncFirstProjectHistory(win);
    await waitForDiscoveredSessions(win, 'p1', [ids.codexSid]);

    await win.getByTestId(`session-item-${ids.codexSid}`).click();
    await expect(win.locator('.toolbar-provider-meta')).toHaveText(/^Codex CLI\s·/);
    await expect(win.locator(`[data-session-id="${ids.codexSid}"]`)).toBeVisible();

    const lines = Array.from(
      { length: 220 },
      (_, index) => `codex-wheel-scroll-line-${String(index).padStart(3, '0')}`,
    ).join('\r\n');
    await win.evaluate(
      ({ sid, data }) => {
        window.__ZEELIN_TEST__?.appendTerminalData?.(sid, `${data}\r\n`);
      },
      { sid: ids.codexSid, data: lines },
    );

    await expect
      .poll(
        async () => {
          const state = await win.evaluate(
            (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
            ids.codexSid,
          );
          return state ? state.baseY - state.rows : -1;
        },
        { timeout: 15000, intervals: [200, 400, 800] },
      )
      .toBeGreaterThan(0);

    await win.evaluate((sid) => {
      window.__ZEELIN_TEST__?.scrollTerminalToBottom?.(sid);
      window.__ZEELIN_TEST__?.appendTerminalData?.(sid, '\x1b[?1000h\x1b[?1006h');
    }, ids.codexSid);

    await expect
      .poll(
        async () => {
          const state = await win.evaluate(
            (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
            ids.codexSid,
          );
          return state ? state.baseY - state.viewportY : Number.POSITIVE_INFINITY;
        },
        { timeout: 5000, intervals: [100, 200, 400] },
      )
      .toBeLessThanOrEqual(1);

    const before = await win.evaluate(
      (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
      ids.codexSid,
    );
    expect(before.baseY).toBeGreaterThan(before.rows);
    expect(before.baseY - before.viewportY).toBeLessThanOrEqual(1);

    await win.evaluate((sid) => {
      const pane = document.querySelector(`[data-session-id="${sid}"]`);
      pane?.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -1600,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, ids.codexSid);

    await expect
      .poll(
        async () => {
          const state = await win.evaluate(
            (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
            ids.codexSid,
          );
          return state ? state.baseY - state.viewportY : 0;
        },
        { timeout: 5000, intervals: [100, 200, 400] },
      )
      .toBeGreaterThan(1);
  } finally {
    await closeApp({ electronApp, root });
  }
});

test('Windows CLI resumes after terminal fit so startup columns match UI columns', async () => {
  test.skip(process.platform !== 'win32', 'Windows-only PTY startup size regression coverage');

  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-fake-claude-size-'));
  createFakeClaudeRuntime(runtimeRoot);
  const launched = await launchAppWithFixtures({
    rootPrefix: 'cliswitch-multi-cli-size-',
    envOverrides: { ZEELIN_CLI_RUNTIME_DIR: runtimeRoot },
  });
  const { electronApp, window: win, ids, root } = launched;
  try {
    await win.setViewportSize({ width: 1600, height: 900 });
    await syncFirstProjectHistory(win);
    await waitForDiscoveredSessions(win, 'p1', [ids.claudeSid]);

    await win.getByTestId(`session-item-${ids.claudeSid}`).click();
    await expect(win.locator('.toolbar-provider-meta')).toHaveText(/^Claude Code\s·/);
    const geometry = await waitForTerminalGeometry(win, ids.claudeSid);

    await expect
      .poll(
        async () => {
          const output = await win.evaluate(
            (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
            ids.claudeSid,
          );
          return output.includes('ZEELIN_FAKE_CLAUDE_STARTED');
        },
        { timeout: 15000, intervals: [200, 400, 800] },
      )
      .toBe(true);

    await expect
      .poll(
        () => electronApp.evaluate(() => {
          const metas = globalThis.__ZEELIN_E2E_PTY_SERVICE__?.listSessionMeta?.() || [];
          return metas.find((item) => item?.provider === 'claude') || null;
        }),
        { timeout: 15000, intervals: [200, 400, 800] },
      )
      .toMatchObject({
        initialCols: expect.any(Number),
        initialRows: expect.any(Number),
      });

    const sessionMeta = await electronApp.evaluate(
      () => {
        const metas = globalThis.__ZEELIN_E2E_PTY_SERVICE__?.listSessionMeta?.() || [];
        return metas.find((item) => item?.provider === 'claude') || null;
      },
    );
    expect(sessionMeta.initialCols).toBeGreaterThan(20);
    expect(sessionMeta.initialRows).toBeGreaterThan(5);
    expect(Math.abs(sessionMeta.initialCols - geometry.cols)).toBeLessThanOrEqual(1);
    expect(Math.abs(sessionMeta.initialRows - geometry.rows)).toBeLessThanOrEqual(1);
  } finally {
    await closeApp({ electronApp, root });
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
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
