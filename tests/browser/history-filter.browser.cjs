// Member Clocking history: filter by date (Philippine dates). Clocking page: no
// "Ways to clock" box and no receipt-time note.
module.exports = async (page, { open, check, sample, OUT }) => {
  const member = sample + `F.identity={profile:{role:'member',member_id:7,club_id:1}};`;
  await open('/repo/pages/member/history/page.js', member);
  const rows = () => page.locator('[data-history-list] tbody tr').allInnerTexts();
  const phDay = offsetDays => new Date(Date.now() + 8 * 3600e3 - offsetDays * 86400e3).toISOString().slice(0, 10);
  const all = await rows();
  check(all.length === 2, `all clockings at first (${all.length})`);

  // The sample has one clocking 40 minutes ago and one 29 hours ago.
  const recent = new Date(Date.now() - 40 * 60e3 + 8 * 3600e3).toISOString().slice(0, 10), older = new Date(Date.now() - 29 * 3600e3 + 8 * 3600e3).toISOString().slice(0, 10);
  await page.fill('[data-history-filter] [name=from]', recent); await page.fill('[data-history-filter] [name=to]', recent);
  let shown = await rows();
  check(shown.length === 1 && /Batangas Derby/.test(shown[0]) && /1 of 2/.test(await page.locator('[data-history-count]').innerText()), `one day: only its clockings (${shown.length})`);
  await page.fill('[data-history-filter] [name=from]', older); await page.fill('[data-history-filter] [name=to]', older);
  shown = await rows();
  check(shown.length === 1 && /Practice toss/.test(shown[0]), 'another day: its clocking');
  await page.fill('[data-history-filter] [name=from]', phDay(-30)); await page.fill('[data-history-filter] [name=to]', '');
  check(/No clockings on these dates/.test((await rows()).join(' ')), 'no match: says so');
  await page.click('[data-history-filter] [type=reset]'); await page.waitForTimeout(100);
  check((await rows()).length === 2 && await page.locator('[data-history-count]').innerText() === '', 'Clear: everything again');

  // Phone: the filter fits and the cards follow it.
  await open('/repo/pages/member/history/page.js', member, { viewport: { width: 360, height: 800 } });
  await page.fill('[data-history-filter] [name=from]', recent); await page.fill('[data-history-filter] [name=to]', recent);
  check(await page.locator('.public-card').count() === 1, `phone: cards filtered (${await page.locator('.public-card').count()})`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(over <= 0, `phone: fits the screen (${over}px too wide: ${await page.evaluate(() => [...document.querySelectorAll('.page-view *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map(e => e.tagName + '.' + e.className).join(' / '))})`);
  await page.screenshot({ path: `${OUT}/history-filter-360.png` });

  await open('/repo/pages/member/clocking/page.js', member, { viewport: { width: 390, height: 800 } });
  const text = await page.locator('.page-view').innerText();
  check(await page.locator('.clock-ways').count() === 0 && !/Use any of them|receipt time comes from Supabase/.test(text), 'Clocking page: no Ways to clock box, no receipt-time note');
};
