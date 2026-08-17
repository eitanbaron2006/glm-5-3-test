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

  // Trigger fitView
  await page.evaluate(() => {
    const app = window.app;
    if (app && app.editor) {
      app.editor.fitView();
    }
  });
  await new Promise(r => setTimeout(r, 500));

  // Check bounding box of all nodes vs svg width
  const checkFit = await page.evaluate(() => {
    const app = window.app;
    const editor = app.editor;
    const svgW = editor.svg.clientWidth;
    const nodes = Array.from(app.graph.nodes.values());
    let minScreenX = Infinity, maxScreenX = -Infinity;
    for (const n of nodes) {
      const sx1 = editor.view.x + n.x * editor.view.zoom;
      const sx2 = editor.view.x + (n.x + 170) * editor.view.zoom;
      minScreenX = Math.min(minScreenX, sx1);
      maxScreenX = Math.max(maxScreenX, sx2);
    }
    return {
      svgW,
      minScreenX,
      maxScreenX,
      zoom: editor.view.zoom,
      fitsInWidth: minScreenX >= 0 && maxScreenX <= svgW
    };
  });
  console.log('Fit check results:', checkFit);

  await page.screenshot({ path: 'scripts/fit-bounded-view.png' });
  console.log('Saved screenshot to scripts/fit-bounded-view.png');

  await browser.close();
})();
