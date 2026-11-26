// Club logo: the club administrator uploads one on Club settings; it shows in
// the top bar for the club's members (and admins), and can be removed.
const path = require('path');
module.exports = async (page, { open, app, check, sample, BASE, REPO, OUT }) => {
  // The fake storage's public addresses serve a real logo, so it can be seen.
  await page.route('https://storage.test/**', route => route.fulfill({ path: path.join(REPO, 'assets/images/app-icon-192.png'), contentType: 'image/png' }));
  const setup = `F.identity={profile:{role:'admin',club_id:1}};F.tables.clubs=[{id:1,name:'Mayma Club',rfid_entry_sticker:'required',logo_path:null}];F.rpc.admin_set_club_logo=a=>{const old=F.tables.clubs[0].logo_path;F.tables.clubs[0].logo_path=a.p_path;return {logo_path:a.p_path,replaced_path:old};};`;
  await open('/repo/pages/admin/settings/page.js', setup);
  check(/No logo/.test(await page.locator('[data-logo-preview]').innerText()) && await page.locator('[data-logo-remove]').isHidden(), 'no logo yet');
  await page.locator('[data-logo-file]').setInputFiles(path.join(REPO, 'assets/images/app-icon-512.png'));
  await page.waitForFunction(() => window.FAKE.ops.some(o => o[0] === 'rpc' && o[1] === 'admin_set_club_logo'), null, { timeout: 8000 }).catch(() => {});
  const up = await page.evaluate(() => window.FAKE.ops.find(o => o[0] === 'upload'));
  check(up && up[1] === 'club-logos' && /^1\/\d+\.png$/.test(up[2]) && up[3] === 'image/png', `uploaded to the club's folder as PNG (${JSON.stringify(up)})`);
  const src = await page.locator('[data-logo-preview] img').getAttribute('src').catch(() => '');
  check(src === `https://storage.test/club-logos/${up && up[2]}` && await page.locator('[data-logo-remove]').isVisible(), 'preview shows it; Remove offered');
  check(await page.locator('[data-logo-preview] img').evaluate(img => img.complete && img.naturalWidth > 0), 'the logo image loads');
  await page.locator('.club-logo-panel').screenshot({ path: `${OUT}/club-logo-settings.png` });
  await page.click('[data-logo-remove]'); await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === 'admin_set_club_logo').map(o => o[2].p_path));
  check(calls.at(-1) === null && /No logo/.test(await page.locator('[data-logo-preview]').innerText()), 'Remove clears it');
  check((await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'remove' && o[1] === 'club-logos'))).length >= 1, 'old file deleted');

  // Members see it in the top bar.
  await app(sample + `F.session={user:{id:'u8'}};F.tables.app_profiles=[{id:'u8',role:'member',member_id:8,username:'ana',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Mayma Club',logo_path:'1/1.png'}];`);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/repo/pages/member/dashboard/index.html`); await page.waitForSelector('.member-bottom-nav');
  check(await page.locator('.topbar [data-club-logo] img').getAttribute('src') === 'https://storage.test/club-logos/1/1.png' && await page.locator('.topbar [data-club-logo]').isVisible(), 'top bar shows the club logo');
  await page.locator('.topbar').screenshot({ path: `${OUT}/club-logo-topbar.png` });
};
