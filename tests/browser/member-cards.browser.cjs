// Member pages on phones: compact cards instead of tables (dashboard open races, clocking history).
module.exports = async (page, { open, check, sample, OUT }) => {
  const member = sample + `F.identity={profile:{role:'member',member_id:7,club_id:1}};`;
  await open('/repo/pages/member/dashboard/page.js', member);
  check(await page.locator('.table-scroll').first().isVisible() && !(await page.locator('.public-cards').isVisible()), 'desktop dashboard: table, no cards');
  await open('/repo/pages/member/dashboard/page.js', member, { viewport: { width: 390, height: 800 } });
  const race = (await page.locator('.public-card').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
  check(await page.locator('.public-card').count() === 1 && /BATANGAS DERBY/.test(race) && /Open/.test(race) && /Batangas/.test(race) && /Your pigeons 2/.test(race), `phone dashboard: a card per open race (${race})`);
  check(!(await page.locator('.panel .table-scroll').last().isVisible()), 'phone dashboard: the table is swapped for cards');
  await page.screenshot({ path: `${OUT}/member-dashboard-phone.png`, fullPage: true });

  await open('/repo/pages/member/history/page.js', member, { viewport: { width: 390, height: 800 } });
  await page.click('[data-history-all]'); await page.waitForTimeout(100);
  const cards = await page.locator('.public-card').allInnerTexts();
  const first = (cards[0] || '').replace(/\s+/g, ' ');
  check(cards.length === 2 && /PH-1 P1/.test(first) && /Batangas Derby/.test(first) && /Clocked with Loft reader/.test(first) && /✓ Verified/.test(first), `phone history: a card per receipt (${first})`);
  check(!(await page.locator('.table-scroll').isVisible()) && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone history: no table, no sideways scrolling');
  await page.screenshot({ path: `${OUT}/member-history-phone.png`, fullPage: true });
};
