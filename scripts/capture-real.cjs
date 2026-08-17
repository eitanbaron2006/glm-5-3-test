const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:5173/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1700,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1700, height: 1000 });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Reset to single Mountain node to test pure Mountain primitive
  await page.evaluate(() => {
    // Select Preset 01 · Mountain
    const sel = document.getElementById('sel-preset');
    if (sel) {
      sel.value = '0';
      document.getElementById('btn-preset').click();
    }
  });
  await new Promise(r => setTimeout(r, 3000));

  const screenshotPath = 'scripts/mountain-real.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
})();
