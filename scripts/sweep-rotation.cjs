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
  await new Promise(r => setTimeout(r, 3000));

  const dist = 2.4;
  const y = 0.95;
  const target = [0, 0.15, 0];

  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const x = Math.sin(rad) * dist;
    const z = Math.cos(rad) * dist;

    await page.evaluate((pos, target) => {
      const app = window.app;
      if (app && app.viewport) {
        app.viewport.camera.position.set(pos[0], pos[1], pos[2]);
        app.viewport.controls.target.set(target[0], target[1], target[2]);
        app.viewport.controls.update();
      }
    }, [x, y, z], target);

    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: `scripts/rot_${deg}.png` });
    console.log(`Saved scripts/rot_${deg}.png (x: ${x.toFixed(2)}, z: ${z.toFixed(2)})`);
  }

  await browser.close();
})();
