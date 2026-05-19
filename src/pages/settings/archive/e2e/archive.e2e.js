const path = require('node:path');
const { test, launchApp, closeApp } = require('../../../../tests/e2e');

test.describe('@archive', () => {
  /** @type {import('playwright').ElectronApplication} */
  let electronApp;
  /** @type {import('playwright').Page} */
  let _window;

  test.beforeAll(async () => {
    const cwd = path.resolve(__dirname, '../../../../../');
    const result = await launchApp({ cwd });
    electronApp = result.electronApp;
    _window = result.window;
  });

  test.afterAll(async () => {
    await closeApp({ electronApp });
  });

  test.todo('archive list, restore, and permanent delete');
});
