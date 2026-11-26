// Club admin toolbar: on every admin page, always in view; the page's main
// action, filters, page search, More actions, Find (Ctrl K), bell and account.
module.exports = async (page, { app, check, sample, BASE, OUT }) => {
  await app(sample + `F.session={user:{id:'a1'}};F.tables.app_profiles=[{id:'a1',role:'admin',username:'clubadmin',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Sample Racing Club'}];F.rpc.admin_list_rfid_devices=[];F.rpc.season_standings={year:2026,races:0,years:[],lofts:[],aces:[]};`);
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.goto(`${BASE}/repo/pages/admin/races/index.html`);
  await page.waitForSelector('[data-race-row]');
  const bar = page.locator('[data-admin-toolbar]');
  check(await bar.isVisible(), 'toolbar shows on admin pages');
  check(await page.locator('[data-tb-primary]').innerText() === 'Create schedule' && await page.locator('.schedule-toolbar [data-create-schedule]').isHidden(), 'Races: the toolbar has Create schedule (the page copy is hidden)');
  await page.click('[data-tb-primary]');
  check(await page.locator('[data-schedule-dialog]').evaluate(d => d.open), 'Create schedule opens the pop-up');
  await page.keyboard.press('Escape');

  await page.click('[data-tb-filters]');
  check(await page.locator('.schedule-filter').isHidden() && await page.locator('[data-tb-filters]').getAttribute('aria-pressed') === 'true' && await page.locator('[data-tb-filters]').getAttribute('title') === 'Show filters', 'Hide filters hides the page filters');
  await page.click('[data-tb-filters]');
  check(await page.locator('.schedule-filter').isVisible(), 'Show filters brings them back');

  await page.fill('[data-tb-page-search]', 'batangas');
  const visible = await page.locator('[data-race-row]:not(.tb-hidden)').count();
  check(visible === 1, `page search filters the list (${visible} shown)`);
  await page.fill('[data-tb-page-search]', '');

  await page.evaluate(() => window.scrollTo(0, 2000)); await page.mouse.wheel(0, 2000); await page.waitForTimeout(200);
  check(await bar.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < 140; }), 'stays in view while scrolling');
  await page.screenshot({ path: `${OUT}/admin-toolbar-races.png` });

  // Find (Ctrl K): a bird, opening Band Assignments filtered to it.
  await page.keyboard.press('Control+k');
  check(await page.evaluate(() => document.activeElement?.matches('[data-tb-find-input]')), 'Ctrl K jumps to Find');
  await page.keyboard.type('PH-2'); await page.waitForSelector('[data-find]', { timeout: 5000 }).catch(() => {});
  check(/Bird/.test(await page.locator('[data-tb-find-list]').innerText()), 'Find lists the bird');
  await page.locator('[data-tb-find-list]').screenshot({ path: `${OUT}/admin-toolbar-find.png` }).catch(() => {});
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.dataset.view === 'bird-bonding', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  check(await page.inputValue('[data-tb-page-search]') === 'PH-2' && await page.locator('[data-tb-primary]').innerText() === 'Bond a bird', 'Band Assignments opens with the bird searched; main action is Bond a bird');

  // Results: More actions lists Export and Print.
  await page.evaluate(() => { const a = Object.assign(document.createElement('a'), { href: 'pages/admin/results/index.html' }); document.body.append(a); a.click(); });
  await page.waitForFunction(() => document.body.dataset.view === 'results', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.click('[data-tb-more]');
  const more = await page.locator('[data-tb-more-menu]').innerText();
  check(/Export Excel/.test(more) && /Print/.test(more), `More actions has the page's actions (${more.replace(/\n/g, ' | ')})`);
  check(await page.locator('[data-tb-primary]').innerText() === 'Export Excel', 'Results: main action is Export Excel');
  await page.keyboard.press('Escape');

  await page.click('[data-tb-account]');
  check(/clubadmin/.test(await page.locator('[data-tb-account-menu]').innerText()) && /Sign out/.test(await page.locator('[data-tb-account-menu]').innerText()), 'account menu');
  await page.click('[data-tb-bell]');
  check(await page.locator('[data-tb-bell-menu]').isVisible() && await page.locator('[data-tb-account-menu]').isHidden(), 'one menu open at a time');

  await page.keyboard.press('Escape');

  // Every module: the toolbar is there with that page's main action.
  const modules = [['dashboard', 'Create a race'], ['members', 'Add member'], ['race-points', 'Add race point'], ['entries', 'New entry'], ['remarks', 'Add remark'], ['raceday', 'Big screen'], ['showup', 'Tap a tag'], ['readers', null], ['history', null], ['users', 'Add account'], ['settings', 'Save settings']];
  const seen = [];
  for (const [folder, label] of modules) {
    await page.evaluate(href => { const a = Object.assign(document.createElement('a'), { href }); document.body.append(a); a.click(); a.remove(); }, `pages/admin/${folder}/index.html`);
    await page.waitForFunction(() => !document.querySelector('.page-view[aria-busy]'), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const shown = await page.locator('[data-tb-primary]').isVisible() ? await page.locator('[data-tb-primary]').innerText() : null;
    const ok = await bar.isVisible() && (label === null ? shown === null || shown === 'Show older changes' : shown === label);
    if (!ok) seen.push(`${folder}: ${shown}`);
  }
  check(!seen.length, `every module has the toolbar and its main action (${seen.join('; ')})`);
  // Overview's Create a race opens the Create schedule pop-up on Races.
  await page.evaluate(() => { const a = Object.assign(document.createElement('a'), { href: 'pages/admin/dashboard/index.html' }); document.body.append(a); a.click(); a.remove(); });
  await page.waitForFunction(() => document.body.dataset.view === 'dashboard'); await page.waitForTimeout(400);
  await page.click('[data-tb-primary]');
  await page.waitForFunction(() => document.querySelector('[data-schedule-dialog]')?.open, null, { timeout: 8000 }).catch(() => {});
  check(await page.evaluate(() => Boolean(document.querySelector('[data-schedule-dialog]')?.open)), 'Overview → Create a race opens the pop-up');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-tb-find-toggle]');
  check(await page.locator('[data-tb-find-input]').isVisible(), 'phone: the search button opens Find');
  await page.keyboard.press('Escape'); await page.locator('body').click({ position: { x: 5, y: 500 } });
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'fits a phone');
  await page.screenshot({ path: `${OUT}/admin-toolbar-phone.png` });
};
