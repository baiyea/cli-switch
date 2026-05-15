const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();

  await page.goto('http://localhost:5073');
  await page.waitForTimeout(2000);

  const results = await page.evaluate(() => {
    const switches = Array.from(document.querySelectorAll('button[role="switch"]'));
    return switches.map(sw => {
      const track = sw.getBoundingClientRect();
      const thumb = sw.querySelector('span').getBoundingClientRect();
      return {
        checked: sw.getAttribute('data-state') === 'checked',
        track: { width: track.width, height: track.height },
        thumb: { width: thumb.width, height: thumb.height, left: thumb.left - track.left, top: thumb.top - track.top }
      };
    });
  });

  console.log('UI Analysis Results:', JSON.stringify(results, null, 2));

  await browser.close();
  process.exit(0);
}

run();
