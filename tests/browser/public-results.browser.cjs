// Results before login (home page): rank, race status and Show up verification.
module.exports = async (page, { open, check, OUT }) => {
  const rows = [
    { race_name: 'Batangas Derby', loft_name: 'Blue Loft', distance_m: 90000, pigeon_ring: 'PH-1 P1', barcode: '111', arrival_at_utc: '2026-11-22 03:00:00', flight_seconds: 3600, speed_m_per_min: 1500, rank: 1, race_status: 'open', verification: 'verified' },
    { race_name: 'Batangas Derby', loft_name: 'Red Loft', distance_m: 91000, pigeon_ring: 'PH-3', barcode: '333', arrival_at_utc: '2026-11-22 03:05:00', flight_seconds: 3900, speed_m_per_min: 1400, rank: 2, race_status: 'open', verification: 'provisional' },
    { race_name: 'Lipa Final', loft_name: 'Blue Loft', distance_m: 40000, pigeon_ring: 'PH-2', barcode: '222', arrival_at_utc: '2026-11-22 02:00:00', flight_seconds: 2000, speed_m_per_min: 1200, rank: 1, race_status: 'closed', verification: 'verified', disqualified: false },
    { race_name: 'Lipa Final', loft_name: 'Green Loft', distance_m: 41000, pigeon_ring: 'PH-9', barcode: '999', arrival_at_utc: '2026-11-22 01:50:00', flight_seconds: 1400, speed_m_per_min: 1757, rank: null, race_status: 'closed', verification: 'provisional', disqualified: true }
  ];
  await open('/repo/pages/results/public.js', `F.rpc.public_result_clubs=[{club_id:1,club_name:'Mayma Club'}];F.rpc.public_race_results=${JSON.stringify(rows)};`, { fn: 'mountPublicResults' });
  await page.selectOption('[name=club_id]', '1');
  await page.fill('[name=race_date]', '2026-11-22');
  await page.click('[data-public-results-form] [type=submit]');
  await page.waitForSelector('[data-public-results-table] table', { timeout: 5000 }).catch(() => {});
  const lines = page.locator('[data-public-results-table] tbody tr:not(.public-race)');
  const headers = await page.locator('[data-public-results-table] thead th').allInnerTexts();
  check(headers.slice(0, 5).map(h => h.trim().toLowerCase()).join(',') === '#,loft,ring,arrival,m/min', `simple columns (${headers.join(' | ')})`);
  const races = await page.locator('[data-public-results-table] .public-race').allInnerTexts();
  check(races.length === 2 && /Batangas Derby\s+Open/.test(races[0]) && /Lipa Final\s+Final/.test(races[1]), `one heading line per race with its status (${races.join(' | ')})`);
  const order = (await lines.allInnerTexts()).map(t => (t.match(/PH-\d/) || [''])[0]);
  check(order.join(',') === 'PH-1,PH-3,PH-2,PH-9', `rows grouped by race, each race's ranks in order (${order.join(',')})`);
  check((await lines.first().locator('.pr-rank').innerText()) === '1', 'fastest bird ranked 1');
  const body = await page.locator('[data-public-results-table] tbody').innerText();
  check(/11:00:00\sAM/.test(body), `arrival shows seconds (${(body.match(/\d{1,2}:\d{2}(:\d{2})?\s[AP]M/) || [''])[0]})`);
  check(await lines.first().locator('.public-mark.is-ok').count() === 1 && await lines.nth(1).locator('.public-mark:not(.is-ok):not(.is-dq)').count() === 1, 'verified ✓ and provisional P marks');
  const lastRow = lines.last();
  check(/PH-9/.test(await lastRow.innerText()) && await lastRow.locator('.is-dq').count() === 1 && (await lastRow.locator('.pr-rank').innerText()).trim() === '–', 'a disqualified bird is listed last, tagged DQ, not ranked');
  check(await page.locator('[data-public-results-legend]').isVisible(), 'explains the marks');
  for (const width of [1300, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const heights = await page.locator('[data-public-results-table] tr').evaluateAll(rows => rows.map(r => Math.round(r.getBoundingClientRect().height)));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(heights.every(h => h <= 25), `${width}px: every line is 24px (${[...new Set(heights)].join(',')})`);
    check(overflow <= 0, `${width}px: no sideways scrolling (${overflow}px)`);
    await page.screenshot({ path: `${OUT}/public-results-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1300, height: 900 });

  // A failed search hides the legend and toolbar of the previous one.
  await page.evaluate(() => { window.FAKE.rpc.public_race_results = { __error: { message: 'offline' } }; });
  await page.click('[data-public-results-form] [type=submit]'); await page.waitForTimeout(400);
  check(!(await page.locator('[data-public-results-legend]').isVisible()) && !(await page.locator('[data-public-results-toolbar]').isVisible()), 'error: legend and toolbar hidden');
};
