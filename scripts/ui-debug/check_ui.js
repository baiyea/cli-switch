const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const { ensureDir, uiDebugArtifactsDir } = require('../test-artifacts');

function artifactPath(fileName) {
  ensureDir(uiDebugArtifactsDir);
  return path.join(uiDebugArtifactsDir, fileName);
}

async function run() {
  console.log('Starting Vite server...');
  const vite = spawn('pnpm', ['dev:renderer'], {
    stdio: 'inherit',
    shell: true
  });

  // 使用系统安装的 Chrome
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();

  console.log('Waiting for server...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      await page.goto('http://localhost:5073');
      ready = true;
      break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!ready) {
    console.error('Server failed to start or unreachable');
    browser.close();
    vite.kill();
    process.exit(1);
  }

  console.log('Server ready, checking UI...');
  
  try {
    // 强制等待一下 React 渲染
    await page.waitForTimeout(2000);

    // 点击设置按钮
    const settingsBtn = page.locator('button.nav-btn').filter({ hasText: /Settings|设置/ }).first();
    await settingsBtn.click();
    await page.waitForTimeout(1000);

    // 进入 Provider 页面
    const providerTab = page.locator('button').filter({ hasText: /Provider/ }).first();
    if (await providerTab.count() > 0) {
       await providerTab.click();
       await page.waitForTimeout(1000);
    }

    const switchBtn = page.locator('button[role="switch"]').first();
    if (await switchBtn.count() > 0) {
      await switchBtn.scrollIntoViewIfNeeded();
      await switchBtn.screenshot({ path: artifactPath('switch_screenshot_v4.png') });
      console.log('Screenshot saved to docs/debug-artifacts/switch_screenshot_v4.png');
      
      await switchBtn.click();
      await page.waitForTimeout(500);
      await switchBtn.screenshot({ path: artifactPath('switch_screenshot_v4_active.png') });
      console.log('Active screenshot saved to docs/debug-artifacts/switch_screenshot_v4_active.png');
    } else {
      console.log('No switch found, taking full page screenshot');
      await page.screenshot({ path: artifactPath('full_page_v4.png') });
    }
  } catch (e) {
    console.error('Error during UI check:', e);
    await page.screenshot({ path: artifactPath('error_screenshot_v4.png') });
  }

  await browser.close();
  vite.kill();
  process.exit(0);
}

run();
