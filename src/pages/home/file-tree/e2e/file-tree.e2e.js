const path = require("node:path");
const { test, launchApp, closeApp } = require(path.resolve(__dirname, "../../../../tests/e2e"));

test.describe("@file-tree", () => {
  /** @type {import('playwright').ElectronApplication} */
  let electronApp;
  /** @type {import('playwright').Page} */
  let window;

  test.beforeAll(async () => {
    const cwd = path.resolve(__dirname, "../../../../../");
    const result = await launchApp({ cwd });
    electronApp = result.electronApp;
    window = result.window;
  });

  test.afterAll(async () => {
    await closeApp({ electronApp });
  });

  test.todo("file tree expand/collapse and file open");
});
