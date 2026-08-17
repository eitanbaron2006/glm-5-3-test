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

  // Select mountain node
  await page.evaluate(() => {
    const app = window.app;
    if (app && app.graph) {
      const m = Array.from(app.graph.nodes.values()).find(n => n.type === 'mountain');
      if (m) app.selectNode(m.id);
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: 'scripts/new-colors-view.png' });
  console.log('Saved screenshot to scripts/new-colors-view.png');

  await browser.close();
})();
