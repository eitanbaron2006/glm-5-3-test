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

  // 1. Click 2D Views button to split
  await page.click('#btn-2d');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/2d-ortho-all3.png' });
  console.log('Saved 2d-ortho-all3.png');

  // 2. Solo Front Profile
  await page.click('button[data-mode="front"]');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/2d-ortho-front-solo.png' });
  console.log('Saved 2d-ortho-front-solo.png');

  // 3. Solo Side Profile
  await page.click('button[data-mode="side"]');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/2d-ortho-side-solo.png' });
  console.log('Saved 2d-ortho-side-solo.png');

  // 4. Solo Top View
  await page.click('button[data-mode="top"]');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/2d-ortho-top-solo.png' });
  console.log('Saved 2d-ortho-top-solo.png');

  // 5. Restore All 3
  await page.click('button[data-mode="all"]');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/2d-ortho-all3-restored.png' });
  console.log('Saved 2d-ortho-all3-restored.png');

  await browser.close();
})();
