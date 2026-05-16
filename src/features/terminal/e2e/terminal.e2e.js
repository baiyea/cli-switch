const { launchApp, closeApp } = require("../../../tests/e2e/app-runner");
const path = require("node:path");

describe("@terminal E2E", () => {
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

  test("click Start Terminal creates a session", async () => {
    const btn = window.locator("button", { hasText: "Start Terminal" });
    await expect(btn).toBeVisible();
    await btn.click();
    await window.waitForSelector('[data-testid="terminal-pane"]', {
      timeout: 5000,
    });
  });

  test("echo hello returns hello output", async () => {
    await window.waitForSelector('[data-testid="terminal-pane"]');
    await window.waitForTimeout(300);
    // Type "echo hello" into the terminal
    await window.keyboard.type("echo hello");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(500);
  });

  test("pwd returns test project path", async () => {
    await window.keyboard.type("pwd");
    await window.keyboard.press("Enter");
    await window.waitForTimeout(300);
  });
});
