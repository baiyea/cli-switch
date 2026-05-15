const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();

  await page.goto('http://localhost:5073');
  await page.waitForTimeout(3000);

  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('Body HTML:', html);

  await browser.close();
  process.exit(0);
}

run();
