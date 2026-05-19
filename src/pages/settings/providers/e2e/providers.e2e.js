const path = require('node:path');
const { test, launchApp, closeApp } = require('../../../../tests/e2e');

test.describe('@providers', () => {
  /** @type {import('playwright').ElectronApplication} */
  let electronApp;
  /** @type {import('playwright').Page} */
  let window;

  test.beforeAll(async () => {
    const cwd = path.resolve(__dirname, '../../../../../');
    const result = await launchApp({ cwd });
    electronApp = result.electronApp;
    window = result.window;
  });

  test.afterAll(async () => {
    await closeApp({ electronApp });
  });

  test.todo('provider CRUD and connection test');
});
