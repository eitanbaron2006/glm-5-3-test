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

  // Open 2D Views
  await page.click('#btn-2d');
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => {
    const app = window.app;
    if (app && app.viewport) {
      app.viewport.camera.position.set(-1.65, 0.85, -1.15);
      app.viewport.controls.target.set(0, 0.12, 0);
      app.viewport.controls.update();
    }
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'scripts/final-matched-layout.png' });
  console.log('Saved scripts/final-matched-layout.png');

  await browser.close();
})();
