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

  // Reset graph and add a single Mountain -> Output
  await page.evaluate(() => {
    // Click New
    const btnNew = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'New');
    if (btnNew) btnNew.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    // Add Mountain node
    const mItem = Array.from(document.querySelectorAll('.pal-item')).find(i => i.textContent.includes('Mountain'));
    if (mItem) mItem.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    // Add Output node
    const oItem = Array.from(document.querySelectorAll('.pal-item')).find(i => i.textContent.includes('Output'));
    if (oItem) oItem.click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    // Connect Mountain -> Output
    const app = window.app;
    if (app && app.graph) {
      const arr = Array.from(app.graph.nodes.values());
      const m = arr.find(n => n.type === 'mountain');
      const o = arr.find(n => n.type === 'output');
      if (m && o) {
        app.graph.addEdge({
          id: 'e_m_o', fromNode: m.id, fromPort: 'out', toNode: o.id, toPort: 'in'
        });
        app.scheduleBuild(1024);
      }
    }
  });
  await new Promise(r => setTimeout(r, 4000));

  const screenshotPath = 'scripts/mountain-standalone.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
})();
