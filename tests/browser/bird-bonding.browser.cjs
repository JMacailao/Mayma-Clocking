// Bird bonding: list, Bond a bird dialog, ring-number-only birds.
module.exports = async (page, { app, check, sample, BASE, toast }) => {
  await app(sample + `F.session={user:{id:'u'}};F.tables.app_profiles=[{id:'u',role:'admin',username:'jmb',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Club'}];F.tables.nfc_tags=[{tag_uid:'843519DB'}];`);
  await page.goto(`${BASE}/repo/pages/admin/birds/index.html`); await page.waitForSelector('.bird-table');
  check((await page.locator('.bird-row').count()) === 3, 'lists the bonded birds');
  check(/Ring only · sticker/.test(await page.locator('.bird-row', { hasText: 'PH-2' }).innerText()), 'marks ring-only birds');
  check(!(await page.locator('[data-bird-dialog]').evaluate(d => d.open)), 'the form starts closed');
  check((await page.locator('.nav-link.active').innerText()) === 'Bird bonding', 'the menu shows the page');
  await page.click('[data-view-photo]');
  check(await page.locator('.photo-viewer').evaluate(d => d.open), 'a photo opens full size'); await page.keyboard.press('Escape');
  check(!(await page.locator('#bird-form [name=photo]').getAttribute('capture')), 'the photo can be chosen from the library (iPhone does not force the camera)');
  await page.click('[data-bond-new]'); await page.click('[data-bond-tab=ring]');
  check(!(await page.locator('[name=nfc_tag]').isVisible()), 'ring-only bonding has no RFID field');
  await page.selectOption('#bird-form [name=member_id]', '8'); await page.fill('#bird-form [name=ring_number]', 'PH-9'); await page.fill('#bird-form [name=bird_name]', 'Nine'); await page.selectOption('#bird-form [name=color]', 'Blue bar');
  await page.click('[data-save-bird]'); await page.waitForTimeout(300);
  check(/photo is required/i.test(await toast()), 'a photo is required');
  await page.click('[data-cancel-edit]');
  check(!(await page.locator('[data-bird-dialog]').evaluate(d => d.open)), 'Cancel closes the form');
  await page.fill('[data-filter-text]', 'Storm');
  check((await page.locator('.bird-row').count()) === 1, 'search filters the list');
};
