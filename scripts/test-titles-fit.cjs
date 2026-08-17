const puppeteer = require('puppeteer-core');

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
  await new Promise(r => setTimeout(r, 3000));

  // Verify node title styles
  const titleStyle = await page.evaluate(() => {
    const el = document.querySelector('.node-title');
    if (!el) return null;
    const computed = window.getComputedStyle(el);
    return {
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      fill: computed.fill,
      color: computed.color
    };
  });
  console.log('Node title computed style:', titleStyle);

  // Take screenshot
  await page.screenshot({ path: 'scripts/node-titles-and-fit.png' });
  console.log('Saved screenshot to scripts/node-titles-and-fit.png');

  await browser.close();
})();
