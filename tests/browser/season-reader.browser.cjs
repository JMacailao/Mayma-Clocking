// Member dashboard: loft reader status with taps waiting; Results: season standings.
module.exports = async (page, { open, check, sample, OUT }) => {
  const standings = `F.rpc.season_standings=a=>({year:a.p_year||2026,races:3,years:[2026,2025],
    lofts:[{member_id:7,full_name:'Juan Dela Cruz',loft_name:'Blue Sky Loft',member_no:'M-01',points:27,wins:2,races:3,birds_clocked:5,best_speed:1125.4},{member_id:8,full_name:'Maria Santos',loft_name:'Sea Breeze Loft',member_no:'M-02',points:18,wins:1,races:2,birds_clocked:3,best_speed:1011.1}],
    aces:[{ring:'PH-2',member_id:8,full_name:'Maria Santos',loft_name:'Sea Breeze Loft',races:2,average_speed:1005.2,best_speed:1011.1,best_place:1}]});`;
  await open('/repo/pages/member/dashboard/page.js', sample + `F.identity={profile:{role:'member',member_id:8,username:'ana',club_id:1}};
    F.rpc.member_reader_status=[{name:'Loft clock',is_online:false,last_heartbeat_at:new Date(Date.now()-25*60000).toISOString(),last_seen_at:null,pending_taps:3}];`);
  await page.waitForSelector('.reader-status', { timeout: 8000 }).catch(() => {});
  const card = await page.locator('.reader-status').innerText().catch(() => '');
  check(/Loft clock/.test(card) && /Offline/.test(card) && /3 taps waiting to send/.test(card) && /25 min ago/.test(card), `reader card shows offline with 3 taps waiting (${card.replace(/\s+/g, ' ')})`);
  await page.locator('.reader-status').screenshot({ path: `${OUT}/reader-status.png` });

  await open('/repo/pages/member/results/page.js', sample + `F.identity={profile:{role:'member',member_id:8,username:'ana',club_id:1}};F.rpc.public_result_clubs=[];` + standings);
  await page.waitForSelector('.season-table', { timeout: 8000 }).catch(() => {});
  const rows = await page.locator('.season-table').first().locator('tbody tr').allInnerTexts();
  check(rows.length === 2 && /Blue Sky Loft/.test(rows[0]) && /27/.test(rows[0]), 'loft standings in points order');
  check(await page.locator('.season-table tr.is-mine').count() === 2, 'the member\'s own loft and bird are highlighted');
  await page.selectOption('[data-season-year]', '2025'); await page.waitForTimeout(300);
  check(await page.evaluate(() => window.FAKE.ops.filter(o => o[1] === 'season_standings').at(-1)[2].p_year) === 2025, 'choosing a year reloads it');
  await page.locator('[data-season]').screenshot({ path: `${OUT}/season-standings.png` });
};
