// Race schedules: shows today's and open races by default, filters by dates,
// and Create schedule opens the form in a pop-up.
module.exports = async (page, { open, check, sample, OUT }) => {
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const setup = sample + `F.identity={profile:{role:'admin',club_id:1}};
    F.tables.races.push({id:21,name:'Old Cup',status:'closed',release_location:'Lipa',open_date:'2026-03-01',end_date:'2026-03-02',release_at_utc:'2026-03-01 00:00:00',created_at:'2026-02-20T00:00:00Z'});
    F.tables.races.push({id:22,name:'Today Draft',status:'draft',release_location:'Lipa',open_date:'${today}',end_date:'${today}',release_at_utc:null,created_at:'2026-01-01T00:00:00Z'});`;
  await open('/repo/pages/admin/races/page.js', setup);
  await page.waitForSelector('[data-race-row]');
  const names = async () => (await page.locator('[data-race-row] td:first-child strong').allInnerTexts());
  let list = await names();
  check(list.includes('Batangas Derby') && list.includes('Today Draft') && !list.includes('Old Cup'), `default: today and open races (${list.join(', ')})`);
  await page.fill('[data-filter-from]', '2026-02-25'); await page.dispatchEvent('[data-filter-from]', 'change');
  await page.fill('[data-filter-to]', '2026-03-05'); await page.dispatchEvent('[data-filter-to]', 'change');
  list = await names();
  check(list.length === 1 && list[0] === 'Old Cup' && /1 of/.test(await page.locator('[data-filter-count]').innerText()), `date range shows only races in it (${list.join(', ')})`);
  await page.click('[data-filter-mode="all"]');
  check((await names()).length >= 3 && await page.inputValue('[data-filter-from]') === '', 'All shows every race and clears the dates');
  await page.click('[data-filter-mode="today"]');

  await page.click('[data-create-schedule]');
  check(await page.locator('[data-schedule-dialog]').evaluate(d => d.open) && await page.locator('[data-schedule-dialog] #race-form').count() === 1, 'Create schedule opens a pop-up with the form');
  check(await page.inputValue('#race-form [name="open_date"]') === today && await page.locator('[data-schedule-editor]').isHidden(), 'dates start at today; the side editor is closed');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.screenshot({ path: `${OUT}/race-create-popup.png` });
  await page.click('[data-close-dialog]');
  await page.waitForFunction(() => document.querySelector('[data-schedule-editor] #race-form'), null, { timeout: 5000 }).catch(() => {});
  check(!(await page.locator('[data-schedule-dialog]').evaluate(d => d.open)) && await page.locator('[data-schedule-editor] #race-form').count() === 1, 'closing puts the form back');
  await page.click('[data-race-row="5"]');
  check(await page.locator('[data-schedule-editor]').isVisible() && await page.inputValue('#race-form [name="name"]') === 'Batangas Derby', 'clicking a race still edits it beside the list');
  await page.locator('.schedule-toolbar').screenshot({ path: `${OUT}/race-filter.png` });
};
