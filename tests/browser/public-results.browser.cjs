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
  const headers = await page.locator('[data-public-results-table] th').allInnerTexts();
  check(/^rank$/i.test(headers[0].trim()) && headers.some(h => /status/i.test(h)) && headers.some(h => /verified/i.test(h)), `columns Rank, Status, Verified (${headers.join(' | ')})`);
  const body = await page.locator('[data-public-results-table] tbody').innerText();
  check(/✓ Verified/.test(body) && /Provisional/.test(body), 'shows verified and provisional');
  check(/Closed · final/.test(body) && /\bOpen\b/.test(body), 'shows the race status');
  const firstRank = await page.locator('[data-public-results-table] tbody tr').first().locator('.public-rank').innerText().catch(() => '');
  check(firstRank === '1', 'fastest bird ranked 1');
  check(/11:00:00\sAM/.test(body), `arrival shows seconds (${(body.match(/\d{1,2}:\d{2}(:\d{2})?\s[AP]M/) || [''])[0]})`);
  const lastRow = await page.locator('[data-public-results-table] tbody tr').last().innerText();
  check(/PH-9/.test(lastRow) && /\bDQ\b/.test(lastRow) && !/\b1\b\s*\n?\s*Lipa/.test(lastRow), `a disqualified bird is listed last, tagged DQ, not ranked (${lastRow.replace(/\s+/g, ' ').slice(0, 90)})`);
  check(await page.locator('[data-public-results-legend]').isVisible(), 'explains the columns');
  await page.screenshot({ path: `${OUT}/public-results.png`, fullPage: true });
};
