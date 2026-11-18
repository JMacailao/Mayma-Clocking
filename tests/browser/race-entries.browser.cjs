// Race entries: RFID tap, sticker, race expiry, last-race birds, rules.
module.exports = async (page, { open, check, sample, toast }) => {
  const setup = sample + `F.tables.races.unshift({id:6,name:'Lucena Open',status:'open',release_location:'Lucena',release_at_utc:null,open_date:'2026-11-20',end_date:'2026-11-21',club_id:1,nfc_expiry_days:3});
    F.tables.nfc_tags=[{tag_uid:'843519DB'},{tag_uid:'6C811F4A'}];F.tables.barcode_stickers=[{barcode_number:'555',is_registered:true}];F.tables.entry_remark_options=[{label:'P1',is_active:true}];
    F.tables.race_entries.find(e=>e.id===13).nfc_expires_at=new Date(Date.now()-3600e3).toISOString();`;
  const tap = async uid => { await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.type(uid, { delay: 5 }); await page.keyboard.press('Enter'); await page.waitForTimeout(300); };
  await open('/repo/pages/admin/entries/page.js', setup, { fn: 'entriesPage' });
  await page.selectOption('#entry-race', '6');
  check(/3 days after release/.test(await page.locator('[data-race-expiry]').innerText()), 'shows the race tag expiry');
  check((await page.locator('[name=nfc_expiry_days]').count()) === 0, 'no expiry choice per pigeon');
  // PH-1's tag is still active in the open Batangas Derby.
  await page.check('#entry-form [name=nfc_read_with][value=wired]');
  await tap('843519DB');
  check(/still active in Batangas Derby/.test(await page.locator('.entry-bird-warning').innerText().catch(() => '')), 'warns: tag still active in another race');
  await page.fill('[name=barcode]', '555'); await page.click('#entry-form button.primary'); await page.waitForTimeout(300);
  check(/still active/.test(await toast()), 'refuses to save it');
  // PH-3's tag expired in that race: it can be entered.
  await tap('6C811F4A');
  check(/Tag read successfully: PH-3/.test(await page.locator('[data-tag-status]').innerText()), 'a tap shows the bird');
  await page.fill('[name=barcode]', '555'); await page.check('[name=remarks][value=P1]'); await page.click('#entry-form button.primary'); await page.waitForTimeout(400);
  const saved = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'insert' && o[1] === 'race_entries').at(-1)?.[2] || {});
  check(saved.pigeon_id === 3 && saved.race_id === 6 && saved.barcode === '555' && saved.remarks?.[0] === 'P1', 'saves the entry with bird, sticker and remarks');
  check(!('nfc_expires_at' in saved), 'the expiry is left to the database (from the race)');
  await tap('6C811F4A');
  check(/already entered/.test(await toast()), 'the same bird cannot be entered twice');
  check((await page.locator('[data-registered-entries] tbody tr').count()) === 1, 'the new entry is listed');
  // Sticker entries: last race birds, and a tap switches to RFID entries.
  await page.click('[data-entry-tab=sticker]'); await page.selectOption('#entry-form [name=member_id]', '7');
  check((await page.locator('[data-last-bird]').count()) >= 1, 'offers the member\'s birds from the last race');
  await tap('843519DB');
  check((await page.locator('#entry-form').getAttribute('data-mode')) === 'rfid', 'an RFID tap on Sticker entries switches to RFID entries');
};
