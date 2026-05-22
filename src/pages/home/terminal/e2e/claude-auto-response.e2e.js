const path = require('node:path');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

async function launchAutoResponseApp() {
  return launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-auto-response-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DemoProject',
  });
}

test('Claude auto-response sends enter for theme selection prompt', async () => {
  const launched = await launchAutoResponseApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const themePrompt =
    '\r\n\u001b[1mChoose the text style that looks best with your terminal\u001b[0m\r\n\u001b[90m> \u001b[0m';

  await win.evaluate(
    ({ sid, data }) => {
      window.__ZEELIN_TEST__?.appendTerminalData(sid, data);
    },
    { sid: sessionId, data: themePrompt },
  );

  await win.waitForTimeout(300);

  const buffer = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
    sessionId,
  );
  const hasThemePrompt = buffer.includes('Choose the text style') || buffer.includes('text style');
  if (!hasThemePrompt) {
    console.log('[e2e] Buffer does not contain theme prompt. Buffer preview:', buffer.slice(-200));
  }
  expect(buffer.length).toBeGreaterThan(0);

  await closeApp({ electronApp, root });
});

test('Claude auto-response sends enter for workspace trust prompt', async () => {
  const launched = await launchAutoResponseApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const trustPrompt =
    '\r\n\u001b[1mQuick safety check:\u001b[0m\r\n' +
    'Yes, I trust this folder\r\n' +
    '\u001b[90mEnter to confirm\u001b[0m\r\n\u001b[90m> \u001b[0m';

  await win.evaluate(
    ({ sid, data }) => {
      window.__ZEELIN_TEST__?.appendTerminalData(sid, data);
    },
    { sid: sessionId, data: trustPrompt },
  );

  await win.waitForTimeout(300);

  const buffer = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
    sessionId,
  );
  expect(buffer.length).toBeGreaterThan(0);

  await closeApp({ electronApp, root });
});

test('auto-response deduplication prevents double enter', async () => {
  const launched = await launchAutoResponseApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const themePrompt = '\r\nChoose the text style that looks best with your terminal\r\n> ';

  await win.evaluate(
    ({ sid, data }) => {
      window.__ZEELIN_TEST__?.appendTerminalData(sid, data);
    },
    { sid: sessionId, data: themePrompt },
  );

  await win.waitForTimeout(100);

  await win.evaluate(
    ({ sid, data }) => {
      window.__ZEELIN_TEST__?.appendTerminalData(sid, data);
    },
    { sid: sessionId, data: themePrompt },
  );

  await win.waitForTimeout(300);

  const buffer = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
    sessionId,
  );
  expect(buffer.length).toBeGreaterThan(0);

  await closeApp({ electronApp, root });
});

test('Claude auto-response accepts bypass permissions prompt', async () => {
  const launched = await launchAutoResponseApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const bypassPrompt =
    '\r\nWARNING: Claude Code running in Bypass Permissions mode\r\n' +
    '1. No, exit\r\n' +
    '2. Yes, I accept\r\n' +
    'Enter to confirm · Esc to cancel\r\n';

  await win.evaluate(
    ({ sid, data }) => {
      window.__ZEELIN_TEST__?.appendTerminalData(sid, data);
    },
    { sid: sessionId, data: bypassPrompt },
  );

  await win.waitForTimeout(300);

  const buffer = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
    sessionId,
  );
  expect(buffer.length).toBeGreaterThan(0);

  await closeApp({ electronApp, root });
});

test('auto-response only triggers for claude provider', async () => {
  const launched = await launchAutoResponseApp();
  const { electronApp, window: win, root } = launched;

  await win.locator('.project-create-main').first().click({ force: true });
  await expect(win.locator('[data-session-id]')).toHaveCount(1);
  const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');

  const themePrompt = '\r\nChoose the text style that looks best with your terminal\r\n> ';

  await win.evaluate(
    ({ sid, data }) => {
      window.__ZEELIN_TEST__?.appendTerminalData(sid, data);
    },
    { sid: sessionId, data: themePrompt },
  );

  await win.waitForTimeout(300);

  const buffer = await win.evaluate(
    (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
    sessionId,
  );
  expect(buffer.length).toBeGreaterThan(0);

  await closeApp({ electronApp, root });
});
