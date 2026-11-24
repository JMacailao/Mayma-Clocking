// Results before login (home page): rank, race status and Show up verification.
module.exports = async (page, { open, check, OUT }) => {
  const rows = [
    { race_name: 'Batangas Derby', loft_name: 'Blue Loft', distance_m: 90000, pigeon_ring: 'PH-1 P1', barcode: '111', arrival_at_utc: '2026-11-22 03:00:00', flight_seconds: 3600, speed_m_per_min: 1500, rank: 1, race_status: 'open', verification: 'verified' },
    { race_name: 'Batangas Derby', loft_name: 'Red Loft', distance_m: 91000, pigeon_ring: 'PH-3', barcode: '333', arrival_at_utc: '2026-11-22 03:05:00', flight_seconds: 3900, speed_m_per_min: 1400, rank: 2, race_status: 'open', verification: 'provisional' },
    { race_name: 'Lipa Final', loft_name: 'Blue Loft', distance_m: 40000, pigeon_ring: 'PH-2', barcode: '222', arrival_at_utc: '2026-11-22 02:00:00', flight_seconds: 2000, speed_m_per_min: 1200, rank: 1, race_status: 'closed', verification: 'verified', disqualified: false },
    { race_name: 'Lipa Final', loft_name: 'Green Loft', distance_m: 41000, pigeon_ring: 'PH-9', barcode: '999', arrival_at_utc: '2026-11-22 01:50:00', flight_seconds: 1400, speed_m_per_min: 1757, rank: null, race_status: 'closed', verification: 'provisional', disqualified: true }
  ];
  const summaries = [
    { race_name: 'Batangas Derby', release_location: 'Batangas City', release_latitude: 13.7565, release_longitude: 121.0583, release_at_utc: '2026-11-22 01:30:00', race_status: 'open', birds_entered: 10, birds_clocked: 9 },
    { race_name: 'Lipa Final', release_location: 'Lipa', release_latitude: 13.9411, release_longitude: 121.1631, release_at_utc: '2026-11-22 01:20:00', race_status: 'closed', birds_entered: 4, birds_clocked: 2 }
  ];
  await open('/repo/pages/results/public.js', `F.rpc.public_result_clubs=[{club_id:1,club_name:'Mayma Club'}];F.rpc.public_race_results=${JSON.stringify(rows)};F.rpc.public_race_summaries=${JSON.stringify(summaries)};`, { fn: 'mountPublicResults' });
  await page.selectOption('[name=club_id]', '1');
  await page.fill('[name=race_date]', '2026-11-22');
  await page.click('[data-public-results-form] [type=submit]');
  await page.waitForSelector('[data-public-results-table] table', { timeout: 5000 }).catch(() => {});
  const headers = await page.locator('[data-public-results-table] th').allInnerTexts();
  check(/^rank$/i.test(headers[0].trim()) && headers.some(h => /status/i.test(h)) && headers.some(h => /verified/i.test(h)), `columns Rank, Status, Verified (${headers.join(' | ')})`);
  const body = await page.locator('[data-public-results-table] tbody').innerText();
  check(/✓ Verified/.test(body) && /Provisional/.test(body), 'shows verified and provisional');
  check(/Closed · final/.test(body) && /\bOpen\b/.test(body), 'shows the race status');
  const headers2 = await page.locator('[data-public-race-summaries] .race-summary').allInnerTexts();
  check(headers2.length === 2 && /Batangas Derby/.test(headers2[0]) && /Batangas City/.test(headers2[0]) && /13\.75650° N, 121\.05830° E/.test(headers2[0]) && /9:30:00\sAM/.test(headers2[0]) && /9\/10/.test(headers2[0]) && /2\/4/.test(headers2[1]) && /Closed · final/.test(headers2[1]), `race headers: location, coordinates, release time, clocked/entered (${headers2.map(h => h.replace(/\s+/g, ' ')).join(' | ')})`);
  const firstRank = await page.locator('[data-public-results-table] tbody tr').first().locator('.public-rank').innerText().catch(() => '');
  check(firstRank === '1', 'fastest bird ranked 1');
  check(/11:00:00\sAM/.test(body), `arrival shows seconds (${(body.match(/\d{1,2}:\d{2}(:\d{2})?\s[AP]M/) || [''])[0]})`);
  const lastRow = await page.locator('[data-public-results-table] tbody tr').last().innerText();
  check(/PH-9/.test(lastRow) && /\bDQ\b/.test(lastRow) && !/\b1\b\s*\n?\s*Lipa/.test(lastRow), `a disqualified bird is listed last, tagged DQ, not ranked (${lastRow.replace(/\s+/g, ' ').slice(0, 90)})`);
  check(!/Rank by speed|remain provisional/.test(await page.locator('.public-results-content').innerText()), 'no long explanations');
  const order = (await page.locator('[data-public-results-table] tbody tr').allInnerTexts()).map(t => (t.match(/PH-\d/) || [''])[0]);
  check(order.join(',') === 'PH-1,PH-3,PH-2,PH-9', `rows grouped by race, each race's ranks in order (${order.join(',')})`);
  await page.screenshot({ path: `${OUT}/public-results.png`, fullPage: true });

  check(!(await page.locator('.public-cards').isVisible()), 'desktop: table, no cards');
  // Phones: one compact card per bird instead of the table.
  await page.setViewportSize({ width: 390, height: 800 });
  const cards = page.locator('.public-card');
  check(await cards.count() === 4 && !(await page.locator('[data-public-results-table] .table-scroll').isVisible()), 'phone: cards instead of the table');
  const first = await cards.first().innerText();
  check(/BLUE LOFT/.test(first) && /PH-1 P1/.test(first) && /Batangas Derby/.test(first) && /1,500 m\/min/.test(first) && /✓ Verified/.test(first) && /Open/.test(first), `phone: card shows loft, ring, race, speed, verified, status (${first.replace(/\s+/g, ' ')})`);
  check(/DQ/.test(await cards.last().innerText()) && (await cards.last().locator('.pc-rank').innerText()) === '–', 'phone: DQ card last, not ranked');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: no sideways scrolling');
  await page.screenshot({ path: `${OUT}/public-results-phone.png`, fullPage: true });
  await page.setViewportSize({ width: 1300, height: 900 });

  // A failed search hides the toolbar and race headers of the previous one.
  await page.evaluate(() => { window.FAKE.rpc.public_race_results = { __error: { message: 'offline' } }; });
  await page.click('[data-public-results-form] [type=submit]'); await page.waitForTimeout(400);
  check(!(await page.locator('[data-public-results-toolbar]').isVisible()) && !(await page.locator('[data-public-race-summaries]').isVisible()), 'error: toolbar and race headers hidden');

  // Before entry-remarks.sql is re-run (no race headers function): results still show.
  await page.evaluate(rows => { window.FAKE.rpc.public_race_results = rows; delete window.FAKE.rpc.public_race_summaries; }, rows);
  await page.click('[data-public-results-form] [type=submit]'); await page.waitForTimeout(400);
  check(await page.locator('[data-public-results-table] tbody tr').count() === 4 && !(await page.locator('[data-public-race-summaries]').isVisible()), 'no race headers function: results still show');
};
