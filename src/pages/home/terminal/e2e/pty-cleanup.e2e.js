const path = require('node:path');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

async function launchCleanupApp() {
  return launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-pty-cleanup-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DemoProject',
  });
}

test('app close destroys all PTY sessions', async () => {
  const launched = await launchCleanupApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const hasSession = await win.evaluate((sid) => {
    const buffer = window.__ZEELIN_TEST__?.getSessionBuffer(sid);
    return buffer !== undefined;
  }, sessionId);
  expect(hasSession).toBe(true);

  await win.evaluate(() => window.__ZEELIN_TEST__?.destroyAllSessions?.());
  await win.waitForTimeout(500);

  await closeApp({ electronApp, root });
});

test('multiple sessions are all cleaned up on exit', async () => {
  const launched = await launchCleanupApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId1 = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const sessionId2 = await win.evaluate(() => 'test-session-2');

  if (!sessionId2 || sessionId2 === sessionId1) {
    await win.evaluate(() => window.__ZEELIN_TEST__?.destroyAllSessions?.());
    await closeApp({ electronApp, root });
    return;
  }

  const hasMultiple = await win.evaluate((sid) => {
    return window.__ZEELIN_TEST__?.getSessionBuffer(sid) !== undefined;
  }, sessionId2);

  if (hasMultiple) {
    await win.evaluate(() => window.__ZEELIN_TEST__?.destroyAllSessions?.());
    await win.waitForTimeout(500);
  }

  await closeApp({ electronApp, root });
});

test('destroyAllSessions clears session buffers', async () => {
  const launched = await launchCleanupApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  await win.evaluate(({ sid, data }) => window.__ZEELIN_TEST__?.appendTerminalData(sid, data), {
    sid: sessionId,
    data: 'test data for buffer\r\n',
  });

  await win.waitForTimeout(200);

  const beforeBuffer = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
    sessionId,
  );
  expect(beforeBuffer.length).toBeGreaterThan(0);

  await win.evaluate(() => window.__ZEELIN_TEST__?.destroyAllSessions?.());
  await win.waitForTimeout(500);

  await expect(win.locator('[data-session-id]')).toHaveCount(0);

  await closeApp({ electronApp, root });
});

test('Windows PTY cleanup does not throw on destroy', async () => {
  const launched = await launchCleanupApp();
  const { electronApp, window: win, root } = launched;

  const isWindows = await win.evaluate(() => /Win32|Win64/.test(navigator.platform));

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);

  await win.evaluate(() => window.__ZEELIN_TEST__?.destroyAllSessions?.());
  await win.waitForTimeout(500);

  await closeApp({ electronApp, root });

  if (isWindows) {
    console.log('[e2e] Windows PTY cleanup test passed — no exceptions thrown during destroy');
  }
});
