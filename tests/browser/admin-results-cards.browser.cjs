// Admin Race results: compact cards on phones, the full table on desktop.
module.exports = async (page, { open, check, sample, OUT }) => {
  await open('/repo/pages/admin/results/page.js', sample);
  check(await page.locator('#results-table .table-scroll').isVisible() && !(await page.locator('#results-table .public-cards').isVisible()), 'desktop: table, no cards');
  await page.setViewportSize({ width: 390, height: 800 });
  const cards = page.locator('#results-table .public-card');
  check(await cards.count() === 4 && !(await page.locator('#results-table .table-scroll').isVisible()), 'phone: one card per entry instead of the table');
  const first = (await cards.first().innerText()).replace(/\s+/g, ' ');
  check(/^1 /.test(first) && /JEREMIAH MACAILAO/.test(first) && /PH-1 P1/.test(first) && /Batangas Derby/.test(first) && /90\.000 km/.test(first) && /01:20:00/.test(first) && /1,125 m\/min/.test(first) && /✓ Verified/.test(first) && /M-01/.test(first) && /Sky Loft/.test(first), `phone: rank, member, ring, race, distance, speed, Show up, member no. and loft (${first})`);
  check(/ANA CRUZ/.test(await cards.nth(1).innerText()) && /Waiting/.test(await cards.nth(1).innerText()), 'phone: waiting pill for a bird not yet shown up');
  const notClocked = (await cards.allInnerTexts()).find(t => /PH-3/.test(t)) || '';
  check(/Not clocked/.test(notClocked) && /–/.test(notClocked), 'phone: a bird not clocked has no rank');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: no sideways scrolling');
  await page.screenshot({ path: `${OUT}/admin-results-phone.png`, fullPage: true });
  await page.emulateMedia({ media: 'print' });
  check(await page.locator('#results-table .table-scroll').isVisible(), 'print: the table, even on narrow paper');
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1300, height: 900 });
};
