// Bird bonding: list, Bond a bird dialog, ring-number-only birds.
module.exports = async (page, { app, check, sample, BASE, toast }) => {
  await app(sample + `F.session={user:{id:'u'}};F.tables.app_profiles=[{id:'u',role:'admin',username:'jmb',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Club'}];F.tables.nfc_tags=[{tag_uid:'843519DB'}];`);
  await page.goto(`${BASE}/repo/pages/admin/birds/index.html`); await page.waitForSelector('.bird-table');
  check((await page.locator('.bird-row').count()) === 3, 'lists the bonded birds');
  check(/Ring only · sticker/.test(await page.locator('.bird-row', { hasText: 'PH-2' }).innerText()), 'marks ring-only birds');
  check(!(await page.locator('[data-bird-dialog]').evaluate(d => d.open)), 'the form starts closed');
  check((await page.locator('.nav-link.active').innerText()) === 'Band Assignments', 'the menu shows the page');
  await page.click('[data-view-photo]');
  check(await page.locator('.photo-viewer').evaluate(d => d.open), 'a photo opens full size'); await page.keyboard.press('Escape');
  check(!(await page.locator('#bird-form [name=photo]').getAttribute('capture')), 'the photo can be chosen from the library (iPhone does not force the camera)');
  // The RFID tag must be registered by the Super Admin first.
  // Bond a bird is in the club toolbar ([data-tb-primary]).
  await page.click('[data-tb-primary]'); await page.check('#bird-form [name=nfc_read_with][value=wired]');
  const typeTag = async uid => { await page.fill('#bird-form [name=nfc_tag]', uid); await page.press('#bird-form [name=nfc_tag]', 'Enter'); await page.waitForTimeout(300); };
  await typeTag('AABBCCDD');
  check(/not registered.*Register NFC/.test(await page.locator('[data-tag-check]').innerText()), 'an unregistered tag is refused at once');
  check((await page.inputValue('#bird-form [name=nfc_tag]')) === '', 'and not kept in the field');
  await typeTag('843519DB');
  check(/already assigned to PH-1/.test(await page.locator('[data-tag-check]').innerText()), 'a tag of another active bird is refused');
  await page.evaluate(() => window.FAKE.tables.nfc_tags.push({ tag_uid: '11223344' }));
  await typeTag('11223344');
  check(/registered ✓/.test(await page.locator('[data-tag-check]').innerText()), 'a registered, free tag is accepted');
  await page.click('[data-cancel-edit]');
  await page.click('[data-tb-primary]'); await page.click('[data-bond-tab=ring]');
  check(!(await page.locator('[name=nfc_tag]').isVisible()), 'ring-only bonding has no RFID field');
  await page.selectOption('#bird-form [name=member_id]', '8'); await page.fill('#bird-form [name=ring_number]', 'PH-9'); await page.fill('#bird-form [name=bird_name]', 'Nine'); await page.selectOption('#bird-form [name=color]', 'Blue bar');
  await page.click('[data-save-bird]'); await page.waitForTimeout(300);
  check(/photo is required/i.test(await toast()), 'a photo is required');
  await page.click('[data-cancel-edit]');
  check(!(await page.locator('[data-bird-dialog]').evaluate(d => d.open)), 'Cancel closes the form');
  await page.fill('[data-filter-text]', 'Storm');
  check((await page.locator('.bird-row').count()) === 1, 'search filters the list');
};
