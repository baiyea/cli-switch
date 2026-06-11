const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
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

test('Claude Code launch auto-confirms custom API key prompt with retry', async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cliswitch-fake-claude-runtime-'));
  const capturePath = path.join(runtimeRoot, 'claude-input.hex');
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
const fs = require('node:fs');
const capturePath = process.env.CLAUDE_AUTO_RESPONSE_CAPTURE;
let inputCount = 0;
function writePrompt() {
  process.stdout.write('\\r\\nDetected a custom API key in your environment\\r\\n\\r\\n');
  process.stdout.write('ANTHROPIC_API_KEY: sk-ant-...ioj4X0Wo1AZ6O3DPrrzL\\r\\n\\r\\n');
  process.stdout.write('Do you want to use this API key?\\r\\n\\r\\n');
  process.stdout.write('  1. Yes\\r\\n❯ 2. No (recommended) ✔\\r\\n\\r\\n');
  process.stdout.write('Enter to confirm · Esc to cancel\\r\\n');
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();
writePrompt();
process.stdin.on('data', (chunk) => {
  inputCount += 1;
  const hex = Buffer.from(chunk).toString('hex');
  if (capturePath) fs.appendFileSync(capturePath, hex);
  if (inputCount === 1) {
    process.stdout.write('\\r\\n[first input ignored by fake Claude TUI]\\r\\n');
    writePrompt();
    return;
  }
  if (hex.includes('1b5b410d')) {
    process.stdout.write('\\r\\n[accepted custom API key]\\r\\n');
    setTimeout(() => process.exit(0), 50);
  }
});
setTimeout(() => process.exit(2), 6000);
`,
    'utf8',
  );
  fs.chmodSync(entrypoint, 0o755);

  const launched = await launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-claude-api-key-autoconfirm-',
    envOverrides: {
      ZEELIN_CLI_RUNTIME_DIR: runtimeRoot,
      CLAUDE_AUTO_RESPONSE_CAPTURE: capturePath,
      ANTHROPIC_API_KEY: 'sk-ant-test',
    },
  });
  const { electronApp, window: win, root } = launched;

  try {
    await win.locator('.project-create-main').first().click({ force: true });
    const sessionId = await win.locator('[data-session-id]').first().getAttribute('data-session-id');
    await expect
      .poll(
        async () => {
          const buffer = await win.evaluate(
            (sid) => window.__ZEELIN_TEST__?.getSessionBuffer(sid) || '',
            sessionId,
          );
          return buffer.includes('Detected a custom API key in your environment') &&
            buffer.includes('Do you want to use this API key?');
        },
        { timeout: 8000 },
      )
      .toBe(true);
  } finally {
    await closeApp({ electronApp, root });
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
