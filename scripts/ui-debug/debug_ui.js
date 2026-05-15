const { chromium } = require('@playwright/test');
const path = require('path');
const { ensureDir, uiDebugArtifactsDir } = require('../test-artifacts');

function artifactPath(fileName) {
  ensureDir(uiDebugArtifactsDir);
  return path.join(uiDebugArtifactsDir, fileName);
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();

  // 直接访问 Vite
  await page.goto('http://localhost:5073');
  await page.waitForTimeout(3000); // 等待渲染

  // 截图全屏看看到底显示了什么
  await page.screenshot({ path: artifactPath('debug_app_state.png') });
  
  // 检查是否有错误提示或空白
  const content = await page.content();
  console.log('Page content length:', content.length);

  await browser.close();
  process.exit(0);
}

run();
