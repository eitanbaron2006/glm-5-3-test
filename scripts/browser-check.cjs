/* End-to-end headless check of the running app at http://localhost:5173/. */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:5173/';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1700,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1700, height: 1000 });

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(5000); // first 1024² build

  // ---- boot ----
  const boot = await page.evaluate(() => ({
    svgsInGraph: document.querySelectorAll('#graph-body svg').length,
    nodeGroups: document.querySelectorAll('#graph-body .node-group').length,
    edges: document.querySelectorAll('#graph-body .edge').length,
    thumbs: document.querySelectorAll('#graph-body .node-thumb').length,
    vpCanvas: !!document.querySelector('#viewport-body canvas'),
    paletteItems: document.querySelectorAll('.pal-item').length,
    palSearch: !!document.querySelector('.pal-search'),
    statusNodes: document.getElementById('st-nodes')?.textContent,
    buildTime: document.getElementById('st-time')?.textContent,
    r16: !!document.getElementById('btn-export-r16'),
    propsText: (document.getElementById('props')?.textContent || '').slice(0, 80)
  }));
  check('boot: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('graph: exactly ONE svg in #graph-body', boot.svgsInGraph === 1, `svgs=${boot.svgsInGraph}`);
  check('graph: nodes rendered', boot.nodeGroups >= 1, `nodes=${boot.nodeGroups} edges=${boot.edges}`);
  check('graph: thumbnails present', boot.thumbs === boot.nodeGroups, `thumbs=${boot.thumbs}`);
  check('viewport: three.js canvas present', boot.vpCanvas);
  check('palette: items + search box', boot.paletteItems >= 20 && boot.palSearch, `items=${boot.paletteItems}`);
  check('statusbar: node count matches', boot.statusNodes === String(boot.nodeGroups), `st=${boot.statusNodes}`);
  check('statusbar: build finished', /s$/.test(boot.buildTime || ''), boot.buildTime);
  check('toolbar: R16 export button', boot.r16);
  check('properties: empty-state hint', /No node selected/.test(boot.propsText));

  // ---- preset stacking regression: load 3 presets, svg count must stay 1 ----
  for (const idx of [1, 2, 8]) {
    await page.select('#sel-preset', String(idx));
    await page.click('#btn-preset');
    await sleep(1200);
  }
  const afterLoads = await page.evaluate(() => ({
    svgs: document.querySelectorAll('#graph-body svg').length,
    nodes: document.querySelectorAll('#graph-body .node-group').length
  }));
  check('regression: still ONE svg after 3 preset loads', afterLoads.svgs === 1, `svgs=${afterLoads.svgs}`);
  check('regression: erosion lab has nodes', afterLoads.nodes >= 4, `nodes=${afterLoads.nodes}`);

  // ---- select a node -> properties panel ----
  const nodeBox = await page.evaluate(() => {
    const g = document.querySelector('#graph-body .node-group');
    const r = g.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 12 };
  });
  await page.mouse.click(nodeBox.x, nodeBox.y);
  await sleep(300);
  const sel = await page.evaluate(() => ({
    propsLen: (document.getElementById('props')?.textContent || '').length,
    hasEnabled: !!document.querySelector('#props .param-check-row input[type=checkbox]'),
    dupBtn: !!Array.from(document.querySelectorAll('#props button')).find(b => b.textContent === 'Duplicate')
  }));
  check('select: properties panel populated', sel.propsLen > 50, `len=${sel.propsLen}`);
  check('select: enabled/bypass checkbox shown', sel.hasEnabled);
  check('select: duplicate button shown', sel.dupBtn);

  // ---- add node via context menu, then undo/redo ----
  const before = await page.evaluate(() => document.querySelectorAll('#graph-body .node-group').length);
  await page.evaluate(() => {
    const svg = document.querySelector('#graph-body svg');
    svg.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 500, clientY: 400, button: 2
    }));
  });
  await sleep(300);
  const ctxVisible = await page.evaluate(() => !!document.querySelector('.ctxmenu'));
  check('ctx menu: opens on right-click', ctxVisible);
  if (ctxVisible) {
    await page.evaluate(() => {
      const items = document.querySelectorAll('.ctxmenu .ctx-item');
      if (items[0]) items[0].click();
    });
    await sleep(500);
    const afterAdd = await page.evaluate(() => document.querySelectorAll('#graph-body .node-group').length);
    check('ctx menu: node added', afterAdd === before + 1, `${before} -> ${afterAdd}`);

    await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
    await sleep(600);
    const afterUndo = await page.evaluate(() => document.querySelectorAll('#graph-body .node-group').length);
    check('undo: Ctrl+Z removes the added node', afterUndo === before, `${afterAdd} -> ${afterUndo}`);

    await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control');
    await sleep(600);
    const afterRedo = await page.evaluate(() => document.querySelectorAll('#graph-body .node-group').length);
    check('redo: Ctrl+Y restores it', afterRedo === before + 1, `${afterUndo} -> ${afterRedo}`);
  }

  // ---- palette search ----
  await page.type('.pal-search', 'wind');
  await sleep(250);
  const palFiltered = await page.evaluate(() => ({
    items: Array.from(document.querySelectorAll('.pal-item')).map(i => i.textContent || '')
  }));
  check('palette search: filters to wind',
    palFiltered.items.length > 0 && palFiltered.items.every(t => /wind/i.test(t)),
    palFiltered.items.join(','));
  await page.type('.pal-search', 'zzzz');
  await sleep(250);
  const palEmpty = await page.evaluate(() => !!document.querySelector('.pal-empty'));
  check('palette search: empty state', palEmpty);
  await page.evaluate(() => {
    const s = document.querySelector('.pal-search');
    s.value = ''; s.dispatchEvent(new Event('input'));
  });
  await sleep(250);

  // ---- bypass toggle visually dims node ----
  await page.mouse.click(nodeBox.x, nodeBox.y);
  await sleep(300);
  const bypassClick = await page.evaluate(() => {
    const cb = document.querySelector('#props .param-check-row input[type=checkbox]');
    if (!cb) return false;
    cb.click();
    return true;
  });
  await sleep(900);
  const dimmed = await page.evaluate(() => !!document.querySelector('#graph-body .node-disabled'));
  check('bypass: unchecking Enabled dims node', bypassClick && dimmed);

  await page.screenshot({ path: 'scripts/browser-check.png' });

  console.log('---');
  if (consoleErrors.length) console.log('console errors:', consoleErrors);
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

