// Members: reminders, instant result pop-up with notification, My pigeons, Tagalog.
module.exports = async (page, { open, app, check, sample, BASE }) => {
  await page.context().grantPermissions(['notifications']);
  await open('/repo/pages/member/dashboard/page.js', sample + `F.identity={profile:{role:'member',member_id:8,club_id:1}};`);
  check(/Bring PH-2 to the club for Show up/.test(await page.locator('.member-reminders').innerText()), 'reminds about the show-up');
  await page.evaluate(async () => { window.notes = []; window.Notification = class { constructor(t, o) { window.notes.push([t, o.body]); } static permission = 'granted'; static requestPermission() { return Promise.resolve('granted'); } }; (await import('/repo/assets/js/member-results-watch.js')).watchMemberReceipts(8); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const F = window.FAKE; F.tables.race_entries.push({ id: 15, race_id: 5, member_id: 8, pigeon_ring: 'PH-9', distance_m: 91000, remarks: [] }); F.tables.clock_events.push({ id: 105, race_entry_id: 15, pigeon_ring: 'PH-9', received_at_utc: new Date(Date.now() - 5e3).toISOString().replace('T', ' ').replace('Z', ''), verification: 'provisional', source: 'nfc', time_source: 'reader' }); F.channels.filter(c => c.name.startsWith('member-clocks')).forEach(c => c.handlers.forEach(h => h({}))); });
  await page.waitForTimeout(1500);
  check(/PH-9/.test(await page.locator('dialog.result-popup[open]').innerText().catch(() => '')), 'the result pops up at once');
  check((await page.evaluate(() => window.notes)).some(([title]) => /PH-9/.test(title)), 'and a notification is shown');
  await app(sample + `F.session={user:{id:'u8'}};F.tables.app_profiles=[{id:'u8',role:'member',member_id:8,username:'ana',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Club'}];`);
  await page.goto(`${BASE}/repo/pages/member/pigeons/index.html`); await page.waitForSelector('.bird-table');
  check(/PH-2/.test(await page.locator('.bird-row').first().innerText()), 'My pigeons lists the member\'s birds');
  await page.click('.lang-switch [data-lang=tl]'); await page.waitForSelector('.bird-table'); await page.waitForTimeout(300);
  check((await page.locator('.page-view h2').first().innerText()) === 'Aking mga kalapati', 'Tagalog switch translates the page');
  await page.click('.lang-switch [data-lang=en]'); await page.waitForSelector('.bird-table');
  check((await page.locator('.page-view h2').first().innerText()) === 'My pigeons', 'and back to English');
};
