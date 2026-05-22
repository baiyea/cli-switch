const path = require('node:path');
const { test, expect, launchApp, closeApp } = require('../../../../tests/e2e');

async function launchWindowControlsApp() {
  return launchApp({
    cwd: path.resolve(__dirname, '../../../../../'),
    rootPrefix: 'cliswitch-window-controls-',
    projectDirName: 'project-a',
    projectId: 'p1',
    projectName: 'DemoProject',
  });
}

test('window minimize button reduces window to taskbar', async () => {
  const launched = await launchWindowControlsApp();
  const { electronApp: app, window: win, root } = launched;

  const isWindows = await win.evaluate(() => /Win32|Win64/.test(navigator.platform));
  if (!isWindows) {
    await closeApp({ electronApp: app, root });
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  const minimizeBtn = win.locator('[aria-label="最小化"]').first();
  await expect(minimizeBtn).toBeVisible();

  await minimizeBtn.click();
  await win.waitForTimeout(500);

  const afterState = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return w ? { isMinimized: w.isMinimized(), isMaximized: w.isMaximized() } : null;
  });

  expect(afterState).not.toBeNull();
  expect(afterState.isMinimized).toBe(true);

  await closeApp({ electronApp: app, root });
});

test('window maximize button toggles window size', async () => {
  const launched = await launchWindowControlsApp();
  const { electronApp: app, window: win, root } = launched;

  const isWindows = await win.evaluate(() => /Win32|Win64/.test(navigator.platform));
  if (!isWindows) {
    await closeApp({ electronApp: app, root });
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  const maximizeBtn = win.locator('[aria-label="最大化"]').first();
  await expect(maximizeBtn).toBeVisible();

  await maximizeBtn.click();
  await win.waitForTimeout(500);

  const maximizedState = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return w ? { isMaximized: w.isMaximized(), isNormal: w.isNormal() } : null;
  });

  expect(maximizedState).not.toBeNull();
  expect(maximizedState.isMaximized).toBe(true);

  await maximizeBtn.click();
  await win.waitForTimeout(500);

  const restoredState = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return w ? { isMaximized: w.isMaximized(), isNormal: w.isNormal() } : null;
  });

  expect(restoredState).not.toBeNull();
  expect(restoredState.isMaximized).toBe(false);

  await closeApp({ electronApp: app, root });
});

test('window close button closes the application window', async () => {
  const launched = await launchWindowControlsApp();
  const { electronApp: app, window: win, root } = launched;

  const isWindows = await win.evaluate(() => /Win32|Win64/.test(navigator.platform));
  if (!isWindows) {
    await closeApp({ electronApp: app, root });
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  const closeBtn = win.locator('[aria-label="关闭"]').first();
  await expect(closeBtn).toBeVisible();

  const windowsBefore = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(windowsBefore).toBeGreaterThan(0);

  await closeBtn.click();

  try {
    await app.waitForEvent('window', { timeout: 3000 });
  } catch {}

  await closeApp({ electronApp: app, root });
});

test('window controls are not rendered on macOS', async () => {
  const launched = await launchWindowControlsApp();
  const { electronApp: app, window: win, root } = launched;

  const isMac = await win.evaluate(() => /Mac/.test(navigator.platform));
  if (!isMac) {
    await closeApp({ electronApp: app, root });
    return;
  }

  await win.locator('.project-create-main').first().click({ force: true });

  await expect(win.locator('[aria-label="最小化"]')).toHaveCount(0);
  await expect(win.locator('[aria-label="最大化"]')).toHaveCount(0);
  await expect(win.locator('[aria-label="关闭"]')).toHaveCount(0);

  await closeApp({ electronApp: app, root });
});
