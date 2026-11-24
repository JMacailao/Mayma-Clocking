// AvilonX Android app: when /android-app.json lists a newer APK than the app that
// opened the site, an Update button offers the download; Later hides it.
const fs = require('node:fs'), path = require('node:path');
module.exports = async (page, { app, check, BASE, REPO }) => {
  const latest = JSON.parse(fs.readFileSync(path.join(REPO, 'android-app.json'), 'utf8'));
  await app(`F.rpc.public_result_clubs=[];F.rpc.has_admin_account=true;`);
  const banner = page.locator('[data-app-update]');

  // An older app opens the site: Update links to the latest APK.
  await page.goto(`${BASE}/repo/pages/login/index.html?app=android&appVersion=${latest.versionCode - 1}`);
  await banner.waitFor({ timeout: 5000 }).catch(() => {});
  const link = banner.locator('[data-app-update-go]');
  check(await banner.isVisible() && await link.innerText() === 'Update' && await link.getAttribute('href') === latest.apk, 'older app: Update button with the latest APK');
  check(/^https:\/\/github\.com\/.+\/releases\/latest\/download\/AvilonX\.apk$/.test(latest.apk) && Number.isInteger(latest.versionCode), 'android-app.json is valid');

  // Later hides it for this version, also after reopening.
  await banner.locator('[data-app-update-later]').click();
  await page.goto(`${BASE}/repo/pages/login/index.html?app=android&appVersion=${latest.versionCode - 1}`); await page.waitForTimeout(1200);
  check(await banner.count() === 0, 'Later: not shown again for this version');

  // The current app, and the website in a normal browser: nothing.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/repo/pages/login/index.html?app=android&appVersion=${latest.versionCode}`); await page.waitForTimeout(1200);
  check(await banner.count() === 0, 'up-to-date app: no banner');
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/repo/pages/login/index.html`); await page.waitForTimeout(1200);
  check(await banner.count() === 0, 'browser (not the app): no banner');
};
