// Start scanning: the full-screen radar on the Clocking pages.
module.exports = async (page, { open, check, sample, OUT }) => {
  let deliver = false, sent = false;
  await page.route('http://127.0.0.1:47321/**', route => {
    const tags = deliver && !sent ? [{ seq: 1, uid: '843519DB' }, { seq: 2, uid: '6C811F4A' }] : [];
    if (tags.length) sent = true;
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, app: 'avilonx-acr122u', reader: 'ACR122U PICC 0', seq: sent ? 2 : 0, tags }) });
  });
  await open('/repo/pages/admin/clocking/page.js', sample + `F.rpc.admin_record_clock=async a=>({status:a.p_entry_id===13?'duplicate':'accepted',message:a.p_entry_id===13?'Already clocked.':'Clocking received.',received_at_utc:new Date().toISOString()});`);
  await page.click('[data-radar-open]');
  const dialog = page.locator('dialog.radar-scan');
  check(await dialog.evaluate(d => d.open), 'admin: Start scanning opens the full-screen radar');
  const box = await dialog.boundingBox(), view = page.viewportSize();
  check(box && box.width >= view.width - 1 && box.height >= view.height - 1, `fills the screen (${JSON.stringify(box)})`);
  check(/Batangas Derby|Any open race/.test(await dialog.locator('[data-radar-race]').innerText()), 'shows the race');
  deliver = true;
  await page.waitForFunction(() => document.querySelectorAll('[data-radar-list] li:not(.radar-empty)').length >= 2, null, { timeout: 8000 }).catch(() => {});
  const items = await dialog.locator('[data-radar-list] li').allInnerTexts();
  check(items.length === 2 && /PH-3/.test(items[0]) && /PH-1/.test(items[1]), `both tags listed, newest first (${JSON.stringify(items)})`);
  check(await dialog.locator('.radar-blip').count() === 2, 'a blip for each tag');
  check(await dialog.locator('.radar-blip.is-info').count() === 1, 'already clocked shows amber');
  check((await dialog.locator('[data-radar-count]').innerText()) === '1', 'counts the birds clocked');
  check(/PH-3/.test(await dialog.locator('[data-radar-card]').innerText()), 'big card shows the latest bird');
  check(/ACR122U reader connected/.test(await dialog.locator('[data-radar-reader]').innerText()), 'shows the reader status');
  check(await page.evaluate(() => document.activeElement?.tagName) === 'DIALOG', 'focus on the screen, not a button (a reader\'s Enter presses nothing)');
  await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/radar-desktop.png` });
  await page.click('[data-radar-back]');
  check(!(await dialog.evaluate(d => d.open)), 'Back closes it');
  await page.click('[data-radar-open]'); await page.keyboard.press('Escape');
  check(!(await dialog.evaluate(d => d.open)), 'Esc closes it');

  // Member page on a phone, with a keyboard-type USB reader.
  await open('/repo/pages/member/clocking/page.js', sample + `F.identity={profile:{role:'member',member_id:7,club_id:1}};F.rpc.submit_member_nfc_clock=a=>({status:'accepted',message:'Clocked.',pigeon_ring:'PH-1',race:'Batangas Derby',received_at_utc:new Date().toISOString(),receipt_id:91});`, { viewport: { width: 390, height: 844 } });
  await page.click('[data-clock-tab="eclock"]'); // scanning is on the Eclock tab
  await page.click('[data-radar-open]');
  const phone = page.locator('dialog.radar-scan');
  check(await phone.evaluate(d => d.open), 'member: Start scanning opens the radar');
  await page.keyboard.type('843519DB', { delay: 5 }); await page.keyboard.press('Enter');
  await page.waitForSelector('dialog.radar-scan [data-radar-list] li.is-success', { timeout: 5000 }).catch(() => {});
  check(/PH-1/.test(await phone.locator('[data-radar-list]').innerText()), 'member: a keyboard-type reader\'s tap shows on the radar');
  check(!(await page.locator('dialog.receipt-dialog, [data-receipt-dialog]').first().evaluate(d => d.open).catch(() => false)), 'the receipt pop-up does not cover the radar');
  const scope = await phone.locator('[data-radar-scope]').boundingBox();
  check(scope && scope.width > 250 && scope.x >= 0 && scope.x + scope.width <= 391, `radar fits a phone (${JSON.stringify(scope)})`);
  await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/radar-phone.png` });
  await page.click('[data-radar-back]');
  check(!(await phone.evaluate(d => d.open)), 'member: Back closes it');
};
