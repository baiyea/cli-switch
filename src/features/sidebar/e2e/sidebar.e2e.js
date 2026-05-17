const { launchApp, closeApp } = require("../../../tests/e2e/app-runner");
const path = require("node:path");

describe("@sidebar", () => {
  /** @type {import('playwright').ElectronApplication} */
  let electronApp;
  /** @type {import('playwright').Page} */
  let window;

  beforeAll(async () => {
    const cwd = path.resolve(__dirname, "../../../..");
    const result = await launchApp({ cwd });
    electronApp = result.electronApp;
    window = result.window;
  });

  afterAll(async () => {
    await closeApp({ electronApp });
  });

  test.todo("project CRUD and session list interactions");
});
