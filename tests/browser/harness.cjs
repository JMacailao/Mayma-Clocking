// Browser test harness: serves the site from this checkout, replaces Supabase
// with an in-memory stand-in (fake-supabase.js) and runs one test file.
//   node tests/browser/harness.cjs tests/browser/<name>.browser.cjs
// A test exports async (page, ctx) => {...}; ctx.open(module, setup, opts)
// renders one page module with window.FAKE prepared by `setup` (JS code), and
// ctx.check(condition, message) records a failure without stopping the test.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const REPO = path.resolve(__dirname, '../..'), HERE = __dirname;
const OUT = path.join(os.tmpdir(), 'avilonx-browser-tests'); fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
let setupCode = '';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
  if (p === '/page') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/repo/assets/css/app.css"></head><body data-base="/repo/"><div id="app-shell"><main class="main"><div class="page-content"><div data-message class="notice" hidden></div><section class="page-view"></section></div></main></div>
<script src="/qa/fake-setup.js"></script><script type="module">
const m=await import(${JSON.stringify(url.searchParams.get('module'))});const view=document.querySelector('.page-view');
try{const fn=${JSON.stringify(url.searchParams.get('fn') || 'render')};const cb=f=>{window.cleanup=f;};await (fn==='entriesPage'?m[fn](view,cb):m[fn](view,window.FAKE.identity||{profile:{role:'admin',club_id:1}},cb));}catch(e){window.err=e.message;console.log('render error',e.stack);}window.done=true;
</script></body></html>`);
  }
  if (p === '/qa/fake-setup.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(`window.FAKE={tables:{},rpc:{}};(function(F){${setupCode}})(window.FAKE);`); }
  const file = p.startsWith('/repo/') ? path.join(REPO, p.slice(6)) : p.startsWith('/qa/') ? path.join(HERE, p.slice(4)) : null;
  if (!file || !file.startsWith(REPO)) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const testFile = path.resolve(process.argv[2]), test = require(testFile), name = path.basename(testFile);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  // Supabase comes from the stand-in; spreadsheet export from a small fake; other CDN files are not needed.
  const fakeXlsx = 'window.XLSX={read:()=>({}),utils:{book_new:()=>({}),json_to_sheet:x=>x,aoa_to_sheet:x=>x,book_append_sheet:(b,s,n)=>{(window.xl=window.xl||[]).push([n,s]);}},writeFile:(b,n)=>{window.xlName=n;}};';
  await context.route('https://cdn.jsdelivr.net/**', route => {
    const u = route.request().url();
    if (u.includes('supabase-js')) return route.fulfill({ contentType: 'text/javascript', path: path.join(HERE, 'fake-supabase.js') });
    if (u.includes('xlsx')) return route.fulfill({ contentType: 'text/javascript', body: fakeXlsx });
    return route.abort();
  });
  await context.route(/^https:\/\/(?!cdn\.jsdelivr\.net)/, route => route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  // Pop-ups are accepted, unless the test answers them itself (page.once('dialog', ...)).
  page.on('dialog', d => { if (page.listenerCount('dialog') === 1) d.accept().catch(() => {}); });
  const failures = [];
  const ctx = {
    BASE, OUT, REPO, FIXTURES: path.join(REPO, 'tests/fixtures'), sample: require('./sample-race.cjs'), log: (...a) => console.log('   ', ...a),
    check: (ok, message) => { if (!ok) failures.push(message); },
    async open(module, setup = '', opts = {}) {
      setupCode = setup;
      await page.setViewportSize(opts.viewport || { width: 1300, height: 900 });
      await page.goto(`${BASE}/page?module=${encodeURIComponent(module)}&fn=${opts.fn || 'render'}`);
      await page.waitForFunction('window.done', null, { timeout: 15000 });
      const err = await page.evaluate(() => window.err);
      if (err) failures.push(`render error: ${err}`);
    },
    // Sets the stand-in data for full-app pages (sign-in, menu, routing).
    async app(setup) { await context.addInitScript(`window.FAKE={tables:{},rpc:{}};(function(F){${setup}})(window.FAKE);`); },
    toast: async () => (await page.locator('[data-toast-stack]').innerText().catch(() => '')).split('\n').map(x => x.trim()).filter(x => x && !['×', '🔊', '🔇'].includes(x)).at(-1) || ''
  };
  let crashed = null;
  try { await test(page, ctx); } catch (error) { crashed = error; }
  const errors = [...new Set(pageErrors)].filter(e => !/AudioContext|vibrate/.test(e));
  if (errors.length) failures.push(`page errors: ${errors.join(' | ')}`);
  if (crashed) failures.push(`stopped: ${crashed.message.split('\n')[0]}`);
  await browser.close(); server.close();
  if (failures.length) { console.log(`✗ ${name}`); failures.forEach(f => console.log(`    - ${f}`)); process.exit(1); }
  console.log(`✓ ${name}`); process.exit(0);
})();
