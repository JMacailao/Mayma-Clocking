// Club settings: sticker required or optional for RFID entries, and what Race entries does.
module.exports = async (page, { open, check, sample, toast }) => {
  await open('/repo/pages/admin/settings/page.js', `F.tables.clubs=[{id:1,name:'Mayma Club',rfid_entry_sticker:'required'}];F.rpc.admin_update_club_settings=a=>({rfid_entry_sticker:a.p_rfid_entry_sticker});`);
  check(await page.locator('[name=rfid_entry_sticker][value=required]').isChecked(), 'shows the current setting');
  await page.check('[name=rfid_entry_sticker][value=optional]'); await page.click('[data-save-settings]'); await page.waitForTimeout(300);
  const call = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === 'admin_update_club_settings').at(-1)?.[2]);
  check(call?.p_rfid_entry_sticker === 'optional', 'saves optional');
  check(/optional/.test(await toast()), 'confirms the save');
  await open('/repo/pages/admin/settings/page.js', `F.tables.clubs=[{id:1,name:'Mayma Club'}];`);
  check(/not set up yet/.test(await page.locator('.notice.error').innerText()), 'explains when club-settings.sql was not run');

  const entries = rule => sample + `F.tables.clubs=[{id:1,name:'Club',rfid_entry_sticker:'${rule}'}];F.tables.races.unshift({id:6,name:'Lucena Open',status:'open',release_location:'Lucena',open_date:'2026-11-20',end_date:'2026-11-21',club_id:1});
    F.tables.nfc_tags=[{tag_uid:'6C811F4A'}];F.tables.race_entries=F.tables.race_entries.filter(e=>e.id!==13);`;
  const tapAndSave = async () => {
    await page.selectOption('#entry-race', '6'); await page.check('#entry-form [name=nfc_read_with][value=wired]');
    await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.type('6C811F4A', { delay: 5 }); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    let dialogText = ''; page.once('dialog', d => { dialogText = d.message(); });
    await page.click('#entry-form button.primary'); await page.waitForTimeout(500);
    return dialogText;
  };
  const inserts = () => page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'insert' && o[1] === 'race_entries').map(o => o[2]));
  await open('/repo/pages/admin/entries/page.js', entries('required'), { fn: 'entriesPage' });
  await tapAndSave();
  check(/need the sticker too/.test(await toast()), 'required: an RFID entry without sticker is refused');
  check((await inserts()).length === 0, 'required: nothing saved');
  await open('/repo/pages/admin/entries/page.js', entries('optional'), { fn: 'entriesPage' });
  check(/optional for RFID entries/.test(await page.locator('#entry-form').innerText()), 'optional: the sticker field says so');
  const warning = await tapAndSave();
  check(/No sticker for this pigeon/.test(warning), 'optional: a warning pops up first');
  const saved = (await inserts()).at(-1) || {};
  check(saved.pigeon_id === 3 && saved.barcode === null, 'optional: saved without a sticker after the warning');
  await page.click('[data-entry-tab=sticker]'); await page.fill('#entry-form [name=pigeon_ring]', 'PH-2'); await page.locator('#entry-form [name=pigeon_ring]').dispatchEvent('input');
  await page.click('#entry-form button.primary'); await page.waitForTimeout(300);
  check(/Scan or type the sticker/.test(await toast()), 'Sticker entries always need the sticker');
};
