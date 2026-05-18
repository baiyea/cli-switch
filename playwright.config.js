// @ts-check
const { defineConfig } = require("@playwright/test");
const { e2eRawArtifactsDir } = require("./scripts/test-artifacts");

module.exports = defineConfig({
  // Page Block Capsule: 页面区块 E2E 作为主测试入口
  testDir: "./src/pages",
  testMatch: ["**/e2e/**/*.e2e.js"],
  // 临时忽略占位用例（含 test.todo），避免阻断测试收集
  testIgnore: [
    "**/home/file-tree/e2e/file-tree.e2e.js",
    "**/home/sidebar/e2e/sidebar.e2e.js",
    "**/settings/archive/e2e/archive.e2e.js",
    "**/settings/providers/e2e/providers.e2e.js"
  ],
  timeout: 600000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  workers: 1,
  outputDir: e2eRawArtifactsDir,
  projects: [
    {
      name: "pages-block-e2e"
    }
  ],
  reporter: [
    ["list"],
    ["./scripts/playwright-docs-reporter.js"]
  ],
  use: {
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  }
});
