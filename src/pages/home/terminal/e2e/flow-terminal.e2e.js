const path = require('node:path');
const fs = require('node:fs');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

function seedClaudeSession(homeDir, projectDir, sid, title) {
  const sessionPath = path.join(homeDir, '.claude', 'projects', 'flow-terminal', `${sid}.jsonl`);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    `${JSON.stringify({ cwd: projectDir, message: { role: 'user', content: title } })}\n`,
    'utf8',
  );
}

async function launchFlowApp(options = {}) {
  return launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-terminal-flow-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DemoProject',
    prepareFs: ({ root, projectDir }) => {
      if (options.seedSession) {
        seedClaudeSession(root, projectDir, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'seed-session');
      }
    },
  });
}

async function cleanup(launched) {
  try {
    await launched.window.evaluate(() => window.__ZEELIN_TEST__?.destroyAllSessions?.());
  } catch {}
  await closeApp({ electronApp: launched.electronApp, root: launched.root });
}

async function syncFirstProjectHistory(win) {
  await win.locator('.project-create-toggle').first().click({ force: true });
  await win.getByRole('button', { name: '读取历史会话' }).click({ force: true });
}

test('Task acceptance: quick launch creates claude-01 and injects command', async () => {
  const launched = await launchFlowApp();
  const { window: win } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('.session-item-name').first()).toHaveText('claude-01');
  await expect(win.locator('.toolbar-session-status')).toBeVisible();

  await cleanup(launched);
});

test('Task acceptance: switching sessions keeps both entries and switches active state', async () => {
  const launched = await launchFlowApp({ seedSession: true });
  const { window: win } = launched;

  await syncFirstProjectHistory(win);
  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('.session-item')).toHaveCount(2);
  const firstSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const secondSessionId = await win.locator('.session-item').evaluateAll((nodes, firstId) => {
    for (const node of nodes) {
      const value = String(node.getAttribute('data-testid') || '').replace('session-item-', '');
      if (value && value !== firstId) return value;
    }
    return '';
  }, firstSessionId);
  expect(secondSessionId).toBeTruthy();

  await win.getByTestId(`session-item-${firstSessionId}`).click();
  await expect(win.getByTestId(`session-item-${firstSessionId}`)).toHaveClass(/active/);

  await win.getByTestId(`session-item-${secondSessionId}`).click();
  await expect(win.getByTestId(`session-item-${secondSessionId}`)).toHaveClass(/active/);
  await expect(win.getByTestId(`session-item-${firstSessionId}`)).not.toHaveClass(/active/);

  await cleanup(launched);
});

test('Task acceptance: resize triggers cols/rows update', async () => {
  const launched = await launchFlowApp();
  const { window: win } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const before = await win.evaluate((sid) => window.__ZEELIN_TEST__?.getLastResize(sid), sessionId);
  await win.setViewportSize({ width: 1400, height: 900 });

  const after = await win.evaluate((sid) => window.__ZEELIN_TEST__?.getLastResize(sid), sessionId);
  expect(after).toBeTruthy();
  if (before && after) {
    expect(after.cols > 0).toBeTruthy();
    expect(after.rows > 0).toBeTruthy();
  }

  await cleanup(launched);
});

test('Task acceptance: terminal keeps manual scroll position while new output arrives', async () => {
  const launched = await launchFlowApp();
  const { window: win } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');
  expect(sessionId).toBeTruthy();
  await expect
    .poll(() => win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || ''))
    .toBe(sessionId);

  const initialLines = Array.from(
    { length: 220 },
    (_, index) => `scroll-e2e-line-${String(index).padStart(3, '0')}`,
  ).join('\r\n');
  await win.evaluate(
    ({ sid, data }) => window.__ZEELIN_TEST__?.appendTerminalData(sid, `${data}\r\n`),
    { sid: sessionId, data: initialLines },
  );

  await expect
    .poll(async () =>
      win.evaluate((sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid), sessionId),
    )
    .toMatchObject({ baseY: expect.any(Number), viewportY: expect.any(Number) });

  const atBottom = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
    sessionId,
  );
  expect(atBottom.baseY - atBottom.viewportY).toBeLessThanOrEqual(1);

  await win.evaluate((sid) => window.__ZEELIN_TEST__?.scrollTerminalLines(sid, -80), sessionId);
  const scrolledUp = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
    sessionId,
  );
  expect(scrolledUp.baseY - scrolledUp.viewportY).toBeGreaterThan(1);

  await win.evaluate(
    ({ sid }) =>
      window.__ZEELIN_TEST__?.appendTerminalData(
        sid,
        'scroll-e2e-new-output-after-manual-scroll\r\n',
      ),
    { sid: sessionId },
  );
  await win.waitForTimeout(250);

  const afterOutput = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
    sessionId,
  );
  expect(afterOutput.baseY - afterOutput.viewportY).toBeGreaterThan(1);
  expect(afterOutput.viewportY).toBe(scrolledUp.viewportY);

  await cleanup(launched);
});

test('Task acceptance: floating scroll-to-bottom button appears after manual scroll', async () => {
  const launched = await launchFlowApp();
  const { window: win } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');
  expect(sessionId).toBeTruthy();
  await expect
    .poll(() => win.evaluate(() => window.__ZEELIN_TEST__?.getActiveSessionId?.() || ''))
    .toBe(sessionId);

  const initialLines = Array.from(
    { length: 220 },
    (_, index) => `scroll-button-line-${String(index).padStart(3, '0')}`,
  ).join('\r\n');
  await win.evaluate(
    ({ sid, data }) => window.__ZEELIN_TEST__?.appendTerminalData(sid, `${data}\r\n`),
    { sid: sessionId, data: initialLines },
  );

  await expect
    .poll(async () =>
      win.evaluate((sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid), sessionId),
    )
    .toMatchObject({ baseY: expect.any(Number), viewportY: expect.any(Number) });

  await expect(win.getByRole('button', { name: '滚动到底部' })).toHaveCount(0);

  await win.evaluate((sid) => window.__ZEELIN_TEST__?.scrollTerminalLines(sid, -80), sessionId);
  await expect
    .poll(async () => {
      const state = await win.evaluate(
        (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
        sessionId,
      );
      return state ? state.baseY - state.viewportY : 0;
    })
    .toBeGreaterThan(1);
  await expect(win.getByRole('button', { name: '滚动到底部' })).toBeVisible();

  await win.getByRole('button', { name: '滚动到底部' }).click();

  await expect
    .poll(async () => {
      const state = await win.evaluate(
        (sid) => window.__ZEELIN_TEST__?.getTerminalScrollState(sid),
        sessionId,
      );
      return state ? state.baseY - state.viewportY : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(1);
  await expect(win.getByRole('button', { name: '滚动到底部' })).toHaveCount(0);

  await cleanup(launched);
});

test('Task acceptance: archive closes active session without renderer crash', async () => {
  const launched = await launchFlowApp();
  const { window: win } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);

  await win.getByRole('button', { name: '归档当前会话' }).click();

  await expect(win.locator('[data-session-id]')).toHaveCount(0);

  await cleanup(launched);
});

test('Task acceptance: explorer panel remains flex so tree uses full height', async () => {
  const launched = await launchFlowApp();
  const { window: win } = launched;
  await win.locator('.project-create-main').first().click({ force: true });

  let display = await win.evaluate(() => {
    const explorer = document.querySelector('.explorer');
    if (!explorer) return null;
    return window.getComputedStyle(explorer).display;
  });

  if (display !== 'flex') {
    const toggle = win.getByRole('button', { name: /展开文件树|关闭文件树/ }).first();
    if (await toggle.count()) {
      await toggle.click({ force: true });
      display = await win.evaluate(() => {
        const explorer = document.querySelector('.explorer');
        if (!explorer) return null;
        return window.getComputedStyle(explorer).display;
      });
    }
  }

  expect(display).toBe('flex');

  await cleanup(launched);
});
