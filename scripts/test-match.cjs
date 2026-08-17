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

  const testConfigs = [
    { pos: [-1.95, 1.00, -1.32], target: [0, 0.12, 0], name: 'ang_fit1' },
    { pos: [-2.10, 1.08, -1.42], target: [0, 0.10, 0], name: 'ang_fit2' },
    { pos: [-2.25, 1.15, -1.52], target: [0, 0.10, 0], name: 'ang_fit3' },
    { pos: [-2.00, 1.02, -1.35], target: [0, 0.08, 0], name: 'ang_fit4' },
  ];

  for (const cfg of testConfigs) {
    await page.evaluate((pos, target) => {
      const app = window.app;
      if (app && app.viewport) {
        app.viewport.camera.position.set(pos[0], pos[1], pos[2]);
        app.viewport.controls.target.set(target[0], target[1], target[2]);
        app.viewport.controls.update();
      }
    }, cfg.pos, cfg.target);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: `scripts/${cfg.name}.png` });
    console.log(`Saved scripts/${cfg.name}.png`);
  }

  await browser.close();
})();
