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

  // 1. Open 2D Views
  await page.click('#btn-2d');
  await new Promise(r => setTimeout(r, 1200));

  // 2. Drag horizontal splitter downwards
  const splitH = await page.$('#v2d-split-h');
  const hBox = await splitH.boundingBox();
  await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + 120, { steps: 5 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  // 3. Drag vertical splitter leftwards
  const splitV = await page.$('#v2d-split-v');
  const vBox = await splitV.boundingBox();
  await page.mouse.move(vBox.x + vBox.width / 2, vBox.y + vBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(vBox.x - 80, vBox.y + vBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  // 4. Solo Front View
  await page.click('#v2d-box-front .v2d-hud-btn');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'scripts/2d-before-reset.png' });
  console.log('Saved 2d-before-reset.png');

  // 5. Click Reset button
  await page.click('#v2d-btn-reset-cam');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/2d-after-reset.png' });
  console.log('Saved 2d-after-reset.png');

  await browser.close();
})();
