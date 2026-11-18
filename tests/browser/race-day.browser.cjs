// Race day: timers, live arrivals, reader alerts, show-ups, export, big screen.
module.exports = async (page, { open, check, sample, toast }) => {
  await open('/repo/pages/admin/raceday/page.js', sample);
  check(/Flying 0?2:00/.test(await page.locator('[data-stats]').innerText()), 'shows the flight timer');
  check((await page.locator('[data-arrivals] tbody tr').count()) === 2, 'lists the two arrivals');
  check(/1 loft reader is offline/.test(await page.locator('[data-alerts]').innerText()), 'warns about the offline loft reader');
  check(/1\s*Verified\s*1\s*Waiting/.test(await page.locator('[data-showup]').innerText()), 'counts show-ups');
  await page.click('[data-export]'); await page.waitForTimeout(300);
  check((await page.evaluate(() => window.xlName)) === 'AvilonX-Batangas-Derby.xlsx', 'exports the race to Excel');
  check(/downloaded/.test(await toast()), 'confirms the download');
  await page.click('[data-tv]'); await page.waitForTimeout(200);
  check(/Batangas Derby/.test(await page.locator('[data-tv-board]').innerText()), 'big screen shows the race');
  await page.click('[data-tv-exit]');
  check(await page.locator('[data-tv-board]').isHidden(), 'big screen closes');
  await page.evaluate(() => { const F = window.FAKE; F.tables.clock_events.push({ id: 104, race_entry_id: 13, pigeon_ring: 'PH-3', received_at_utc: new Date(Date.now() - 60e3).toISOString().replace('T', ' ').replace('Z', ''), verification: 'provisional', source: 'nfc', time_source: 'reader' }); F.channels.forEach(c => c.handlers.forEach(h => h({}))); });
  await page.waitForTimeout(500);
  check((await page.locator('[data-arrivals] tbody tr').count()) === 3, 'a new clock appears at once (live update)');
};
