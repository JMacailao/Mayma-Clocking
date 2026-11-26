// Members: speed forecast on My races, like the club SMS. Picker when 2+ races are open.
module.exports = async (page, { open, check, OUT, sample }) => {
  const setup = sample + `F.identity={profile:{role:'member',member_id:7,club_id:1}};
    F.tables.members.forEach(m=>{m.latitude=13.2;m.longitude=121.4;});
    Object.assign(F.tables.races[0],{release_at_utc:'2026-11-18 22:10:00',release_location:'Happy valle (SOCCORO)'});
    F.tables.race_entries.filter(e=>e.race_id===5).forEach(e=>{e.distance_m=36477.43;});`;
  // One open race: no picker, the SMS times.
  await open('/repo/pages/member/dashboard/page.js', setup);
  const panel = page.locator('[data-forecast]');
  check(await panel.isVisible() && await panel.locator('[data-forecast-race]').count() === 0, 'one open race: forecast without a picker');
  const headers = await panel.locator('.forecast-table thead th').allInnerTexts();
  check(headers.map(h => h.trim().toLowerCase()).join('|') === 'speed · m/min|arrival|flight', `column headers kept (${headers.join(' | ')})`);
  const rows = await panel.locator('.forecast-table tbody tr').allInnerTexts();
  const first = (rows[0] || '').replace(/\s+/g, ' '), last = (rows.at(-1) || '').replace(/\s+/g, ' ');
  check(rows.length === 10 && /^1,400 06:36:03 00:26:03$/.test(first) && /^500 07:22:57 01:12:57$/.test(last), `1400 to 500 m/min, as in the SMS (${first} … ${last})`);
  const meta = (await panel.locator('.forecast-summary').innerText()).replace(/\s+/g, ' ');
  check(/Happy valle \(SOCCORO\)/.test(meta) && /36\.48 km/.test(meta) && /Nov 19, 2026, 6:10:00/.test(meta), `release, location and distance shown (${meta})`);

  // Two open races: pick one; a race not entered uses the loft and the release point.
  await open('/repo/pages/member/dashboard/page.js', setup + `F.tables.races.push({id:6,name:'Lucena Special',status:'open',release_location:'Lucena',release_latitude:13.9411,release_longitude:121.6172,release_at_utc:'2026-11-18 23:00:00',open_date:'2026-11-18',end_date:'2026-11-20',club_id:1});`, { viewport: { width: 390, height: 900 } });
  const select = panel.locator('[data-forecast-race]');
  check(await select.count() === 1 && (await select.locator('option').allInnerTexts()).join('|') === 'Batangas Derby|Lucena Special', 'two open races: a picker, entered race first');
  await select.selectOption('6');
  const meta2 = (await panel.locator('.forecast-summary').innerText()).replace(/\s+/g, ' ');
  check(/Lucena/.test(meta2) && /not entered yet/.test(meta2) && await panel.locator('.forecast-table tbody tr').count() === 10, `the other race: forecast from the loft (${meta2.slice(0, 120)})`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: fits the screen');
  const height = (await panel.boundingBox()).height;
  check(height < 480, `phone: compact (${Math.round(height)}px tall)`);
  await panel.screenshot({ path: `${OUT}/member-forecast-390.png` });
  await page.setViewportSize({ width: 1300, height: 900 });
  await panel.screenshot({ path: `${OUT}/member-forecast-1300.png` });

  // No release time yet: a short note instead of times.
  await open('/repo/pages/member/dashboard/page.js', setup + `F.tables.races[0].release_at_utc=null;`);
  check(/once the club sets the official release time/.test(await panel.innerText()) && await panel.locator('.forecast-table tbody tr').count() === 0, 'no release time: explains instead of guessing');
};
