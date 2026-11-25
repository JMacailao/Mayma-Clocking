// Phone layout: bottom navigation that really navigates (with More menu), and the
// Race details card on Race schedules at phone, tablet and desktop widths.
module.exports = async (page, { app, check, sample, BASE, OUT }) => {
  await app(sample + `F.session={user:{id:'u'}};F.tables.app_profiles=[{id:'u',role:'admin',username:'admin',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Mayma Club'}];F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];`);
  const nav = page.locator('.member-bottom-nav');
  // On screen: the slide-out menu is off to the left when closed.
  const onScreen = loc => loc.evaluate(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 1 && r.left < innerWidth; });

  // Phone: bottom bar, no sidebar, no hamburger.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/repo/pages/admin/dashboard/index.html`); await page.waitForSelector('.member-bottom-nav');
  check(await nav.isVisible() && !(await onScreen(page.locator('#app-sidebar'))) && !(await page.locator('#menu-toggle').isVisible()), 'phone: bottom bar shown, sidebar and hamburger hidden');
  const box = await nav.boundingBox();
  check(box && Math.round(box.y + box.height) === 800 && box.width === 390, `phone: bar is fixed full-width at the bottom (${JSON.stringify(box)})`);
  const sizes = await page.locator('.member-bottom-link').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check(sizes.length === 5 && sizes.every(([w, h]) => w >= 44 && h >= 44), `phone: five items, each at least 44px (${JSON.stringify(sizes)})`);
  check(await page.locator('.member-bottom-link[aria-current="page"]').innerText() === 'Overview', 'phone: current page marked');

  // Tapping an item navigates and moves the highlight.
  await page.locator('.member-bottom-nav a', { hasText: 'Races' }).click();
  await page.waitForFunction(() => sessionStorage.getItem('avilonx.route') === 'pages/admin/races/index.html'); await page.waitForSelector('[data-race-row]');
  check(new URL(page.url()).pathname === '/repo/', `the address shows only the site (${page.url()})`);
  check(await page.locator('.member-bottom-link[aria-current="page"]').innerText() === 'Races', 'phone: tapping Races opens it and marks it');
  // Only the site in the address bar, but Refresh, Back and Forward still work.
  await page.reload(); await page.waitForSelector('[data-race-row]', { timeout: 8000 }).catch(() => {});
  check(await page.locator('.topbar h1').innerText() === 'Race schedules' && new URL(page.url()).pathname === '/repo/', 'Refresh: same page, address still only the site');
  await page.goBack(); await page.waitForTimeout(800);
  check(await page.locator('.topbar h1').innerText() === 'Overview', `Back: previous page (${await page.locator('.topbar h1').innerText()})`);
  await page.goForward(); await page.waitForSelector('[data-race-row]', { timeout: 8000 }).catch(() => {});
  check(await page.locator('.topbar h1').innerText() === 'Race schedules', 'Forward: next page');
  const padding = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.page-content')).paddingBottom));
  check(padding >= 64, `phone: content clears the bar (${padding}px)`);

  // Race details card: label left, value right, status pill, inside the screen.
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('[data-race-row="5"]').click();
    const card = page.locator('[data-race-details]');
    const rows = await card.locator('.race-details-row').evaluateAll(els => els.map(row => { const [l, v] = row.children; const a = l.getBoundingClientRect(), b = v.getBoundingClientRect(); return { label: l.textContent, value: v.textContent, side: a.right <= b.left, right: b.right }; }));
    const cardBox = await card.boundingBox();
    check(await card.isVisible() && rows.map(r => r.label).join(',') === 'Race,Release point,Release time,Pigeons,Status', `${width}px: Race details visible with its five rows`);
    check(rows.every(r => r.side && r.right <= width), `${width}px: labels left of values, all inside the screen`);
    check(cardBox && cardBox.x >= 0 && cardBox.x + cardBox.width <= width, `${width}px: card fits the screen`);
    const pill = await card.locator('.tag.open').evaluate(e => getComputedStyle(e).backgroundColor);
    check(pill && pill !== 'rgba(0, 0, 0, 0)', `${width}px: status shown as a coloured pill (${pill})`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no sideways scrolling`);
    if (width === 390) await card.screenshot({ path: `${OUT}/race-details-390.png` });
  }

  // More opens the full menu (every page, sign out); the backdrop closes it.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.locator('.member-bottom-nav [data-open-menu]').click(); await page.waitForTimeout(400);
  check(await page.evaluate(() => document.body.classList.contains('nav-open')) && await onScreen(page.locator('#app-sidebar')) && await page.locator('#app-sidebar').getByText('Race entries').isVisible() && await page.locator('#sign-out').isVisible(), 'More opens the menu with every page and Sign out');
  check(await page.locator('.member-bottom-nav [data-open-menu]').getAttribute('aria-expanded') === 'true', 'More reports it is open');
  await page.locator('#app-sidebar').getByText('Race entries').click();
  await page.waitForFunction(() => sessionStorage.getItem('avilonx.route') === 'pages/admin/entries/index.html'); await page.waitForTimeout(300);
  check(!(await page.evaluate(() => document.body.classList.contains('nav-open'))) && await page.locator('.member-bottom-nav [data-open-menu]').evaluate(e => e.classList.contains('is-active')), 'a page from More closes the menu and highlights More');

  // Tablet and desktop: sidebar, no bottom bar; Race details still shown.
  for (const width of [768, 1300]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE}/repo/pages/admin/races/index.html`); await page.waitForSelector('[data-race-row]');
    check(!(await nav.isVisible()) && await onScreen(page.locator('#app-sidebar')), `${width}px: sidebar shown, bottom bar hidden`);
    await page.locator('[data-race-row="5"]').click();
    check(await page.locator('[data-race-details]').isVisible(), `${width}px: Race details visible`);
  }
  await page.locator('.schedule-editor').screenshot({ path: `${OUT}/race-details-1300.png` });
};
