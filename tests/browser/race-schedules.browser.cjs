// Race schedules: practice races and the race's RFID tag expiry.
module.exports = async (page, { open, check, sample, toast }) => {
  const lastUpdate = () => page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'update').at(-1)?.[2] || {});
  await open('/repo/pages/admin/races/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];F.tables.races[0].nfc_expiry_days=5;`);
  check((await page.inputValue('[name=nfc_expiry_days]')) === '5', 'shows the race expiry');
  await page.selectOption('[name=nfc_expiry_days]', 'custom'); await page.fill('[name=nfc_expiry_custom]', '10');
  await page.check('[name=is_practice]'); await page.click('[data-save-schedule]'); await page.waitForTimeout(300);
  const saved = await lastUpdate();
  check(saved.nfc_expiry_days === 10, 'saves a custom expiry'); check(saved.is_practice === true, 'saves practice');
  check(/Schedule saved/.test(await toast()), 'confirms the save');
  await page.selectOption('[name=nfc_expiry_days]', ''); await page.click('[data-save-schedule]'); await page.waitForTimeout(300);
  check((await lastUpdate()).nfc_expiry_days === null, 'No expiry clears it');
  check((await page.locator('.tag.practice').count()) >= 1, 'practice races are marked in the list');
};
