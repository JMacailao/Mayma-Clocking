// Race schedules: practice races and the race's RFID tag expiry.
module.exports = async (page, { open, check, sample, toast }) => {
  const lastUpdate = () => page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'update').at(-1)?.[2] || {});
  await open('/repo/pages/admin/races/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];F.tables.races[0].nfc_expiry_days=5;F.tables.races[0].lap=3;`);
  check(/Lap 3/.test(await page.locator('.tag.lap').first().innerText().catch(() => '')), 'the lap shows in the schedule list');
  check((await page.inputValue('[name=nfc_expiry_days]')) === '5', 'shows the race expiry');
  await page.selectOption('[name=nfc_expiry_days]', 'custom'); await page.fill('[name=nfc_expiry_custom]', '10');
  await page.check('[name=is_practice]'); await page.click('[data-save-schedule]'); await page.waitForTimeout(300);
  const saved = await lastUpdate();
  check(saved.nfc_expiry_days === 10, 'saves a custom expiry'); check(saved.is_practice === true, 'saves practice');
  check(/Schedule saved/.test(await toast()), 'confirms the save');
  await page.selectOption('[name=nfc_expiry_days]', ''); await page.click('[data-save-schedule]'); await page.waitForTimeout(300);
  check((await lastUpdate()).nfc_expiry_days === null, 'No expiry clears it');
  check((await page.locator('.tag.practice').count()) >= 1, 'practice races are marked in the list');

  // Lap: saved with the schedule, shown in the list; 1 to 99 only.
  check(await page.inputValue('[name=lap]') === '3', 'the form shows the race lap');
  const before = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'update').length);
  await page.fill('[name=lap]', '0'); await page.click('[data-save-schedule]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'update').length) === before, 'lap 0 is refused (not saved)');
  await page.fill('[name=lap]', '2'); await page.click('[data-save-schedule]'); await page.waitForTimeout(300);
  check((await lastUpdate()).lap === 2, 'saves the lap');
  await page.fill('[name=lap]', ''); await page.click('[data-save-schedule]'); await page.waitForTimeout(300);
  check((await lastUpdate()).lap === null, 'clearing the lap saves no lap');

  // Delete: refused while pigeons are entered; an empty race is deleted.
  await open('/repo/pages/admin/races/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];F.rpc.admin_delete_race=a=>{const n=F.tables.race_entries.filter(e=>e.race_id===a.p_race_id).length;F.tables.races=F.tables.races.filter(r=>r.id!==a.p_race_id);F.tables.race_entries=F.tables.race_entries.filter(e=>e.race_id!==a.p_race_id);return {entries:n,clocks:0};};F.tables.races.push({id:78,name:'Old Race',status:'closed',club_id:1,release_location:'Batangas',open_date:'2025-03-01',end_date:'2025-03-02',created_at:'2025-03-01T00:00:00Z'});F.tables.race_entries.push({id:901,race_id:78,member_id:7,pigeon_ring:'PH-9',distance_m:1000});F.tables.races.push({id:77,name:'Empty Race',status:'draft',club_id:1,release_location:'Batangas',open_date:'2026-11-27',end_date:'2026-11-27',created_at:new Date().toISOString()});`);
  await page.click('[data-filter-mode="all"]');
  await page.click('[data-race-row="5"]');
  check(await page.locator('[data-delete-race]').isVisible(), 'Delete race shows when editing');
  await page.click('[data-delete-race]'); await page.waitForTimeout(200);
  check(/pigeons? entered/.test(await toast()) && /6 months after its race day \(from /.test(await toast()) && await page.evaluate(() => window.FAKE.tables.races.some(r => r.id === 5)), `a recent race with pigeons is not deleted (${await toast()})`);
  check(!(await page.evaluate(() => window.FAKE.ops.some(o => o[1] === 'admin_delete_race'))), 'not even asked to the server');
  await page.click('[data-race-row="77"]');
  page.once('dialog', d => d.accept());
  await page.click('[data-delete-race]'); await page.waitForTimeout(300);
  check(await page.evaluate(() => !window.FAKE.tables.races.some(r => r.id === 77)) && /deleted/.test(await toast()), 'an empty race is deleted');
  await page.click('[data-race-row="78"]');
  let asked = '';
  page.once('dialog', d => { asked = d.message(); d.accept(); });
  await page.click('[data-delete-race]'); await page.waitForTimeout(300);
  check(/with its 1 pigeon entry/.test(asked) && await page.evaluate(() => !window.FAKE.tables.races.some(r => r.id === 78)), `a race 6+ months old is deleted with its entries (${asked.slice(0, 80)})`);
  await page.click('[data-create-schedule]');
  check(!(await page.locator('[data-delete-race]').isVisible()), 'no Delete when creating');
};
