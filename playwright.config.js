// @ts-check
const { defineConfig } = require("@playwright/test");
const { e2eRawArtifactsDir } = require("./scripts/test-artifacts");

module.exports = defineConfig({
  testDir: "./scripts/e2e",
  timeout: 120000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  workers: 1,
  outputDir: e2eRawArtifactsDir,
  reporter: [
    ["list"],
    ["./scripts/playwright-docs-reporter.js"]
  ],
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  }
});
