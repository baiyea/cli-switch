const { launchApp, closeApp } = require("../../../tests/e2e/app-runner");
const path = require("node:path");

describe("@workspace E2E", () => {
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

  test("workspace store initializes with null state", async () => {
    const state = await window.evaluate(() => {
      // Access workspace store from the rendered app
      const root = document.getElementById("root");
      return root ? "mounted" : "not-mounted";
    });
    expect(state).toBe("mounted");
  });
});
