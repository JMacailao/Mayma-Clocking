// Race entries → Print basketing sheet: one block per member with tick boxes,
// and a QR code that opens the race's public results.
const fs = require('fs');
module.exports = async (page, { open, check, sample, OUT }) => {
  const qrLib = process.env.QR_LIB && fs.existsSync(process.env.QR_LIB) ? fs.readFileSync(process.env.QR_LIB, 'utf8') : null;
  await page.context().route('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', route => qrLib ? route.fulfill({ contentType: 'text/javascript', body: qrLib }) : route.abort());
  await open('/repo/pages/admin/entries/page.js', sample + `F.identity={profile:{role:'admin',club_id:1}};F.tables.clubs=[{id:1,name:'Sample Racing Club'}];`, { fn: 'entriesPage' });
  check(await page.locator('[data-print-basketing]').count() === 1, 'Print basketing sheet button');
  const popup = page.waitForEvent('popup');
  await page.evaluate(() => { window.print = () => {}; });
  const value = await page.locator('[data-sheet-race] option').nth(1).getAttribute('value').catch(() => null);
  if (value) await page.selectOption('[data-sheet-race]', value);
  await page.locator('[data-print-basketing]').evaluate(button => button.click());
  const sheet = await popup; await sheet.waitForLoadState(); await sheet.waitForTimeout(500);
  const text = await sheet.locator('body').innerText();
  check(/Basketing sheet · /.test(text) && /Basketed/.test(text) && /bird/.test(text), 'sheet lists the entries with tick boxes');
  check(await sheet.locator('.member').count() >= 1 && await sheet.locator('.box').count() >= 1, 'one block per member, a box per bird');
  if (qrLib) check(await sheet.locator('.qr svg').count() === 1 && /Scan for live results/.test(text), 'QR code to the results');
  await sheet.setViewportSize({ width: 900, height: 900 });
  await sheet.screenshot({ path: `${OUT}/basketing-sheet.png` });
  await sheet.close();
};
