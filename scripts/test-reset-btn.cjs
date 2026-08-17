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

  // Click on the first node (Mountain) in the graph canvas
  await page.evaluate(() => {
    const app = window.app;
    if (app && app.graph) {
      const arr = Array.from(app.graph.nodes.values());
      const m = arr.find(n => n.type === 'mountain');
      if (m) {
        app.selectNode(m.id);
      }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Check if Reset button exists
  const resetBtnExists = await page.evaluate(() => {
    const btn = document.querySelector('.btn-reset-params');
    return btn ? btn.textContent : null;
  });
  console.log(`Reset button text: "${resetBtnExists}"`);

  // Change a parameter
  await page.evaluate(() => {
    const app = window.app;
    const m = Array.from(app.graph.nodes.values()).find(n => n.type === 'mountain');
    if (m) {
      m.params['height'] = 1.85;
      app.props.show(m.id);
    }
  });
  await new Promise(r => setTimeout(r, 500));

  const valBefore = await page.evaluate(() => {
    const app = window.app;
    const m = Array.from(app.graph.nodes.values()).find(n => n.type === 'mountain');
    return m ? m.params['height'] : null;
  });
  console.log(`Height before reset: ${valBefore}`);

  // Click Reset button
  await page.evaluate(() => {
    const btn = document.querySelector('.btn-reset-params');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const valAfter = await page.evaluate(() => {
    const app = window.app;
    const m = Array.from(app.graph.nodes.values()).find(n => n.type === 'mountain');
    return m ? m.params['height'] : null;
  });
  console.log(`Height after reset: ${valAfter}`);

  await page.screenshot({ path: 'scripts/reset-btn-view.png' });
  console.log('Saved screenshot to scripts/reset-btn-view.png');

  await browser.close();
})();
