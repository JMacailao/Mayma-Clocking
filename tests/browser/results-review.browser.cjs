// Results: choosing one race shows the review checklist.
module.exports = async (page, { open, check, sample, OUT }) => {
  await open('/repo/pages/admin/results/page.js', sample + `F.identity={profile:{role:'admin',club_id:1}};F.rpc.admin_list_rfid_devices=[];F.rpc.season_standings={year:2026,races:0,years:[],lofts:[],aces:[]};`);
  await page.waitForSelector('#race-filter', { timeout: 8000 });
  check(await page.locator('[data-review]').isHidden(), 'hidden for all races');
  const value = await page.locator('#race-filter option').nth(1).getAttribute('value');
  await page.selectOption('#race-filter', value); await page.waitForTimeout(300);
  const text = await page.locator('[data-review]').innerText();
  check(await page.locator('[data-review]').isVisible() && /(to check|Ready)/.test(text), `review shows (${text.slice(0, 120).replace(/\s+/g, ' ')})`);
  await page.locator('[data-review]').screenshot({ path: `${OUT}/results-review.png` });
};
