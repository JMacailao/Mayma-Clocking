// AvilonX Android app: the newest GitHub release is compared with the installed
// app. Newer: Update button. Same: "Check for updates" says it is the latest.
module.exports = async (page, { app, check, BASE, sample }) => {
  let latest = '1.0.4', fail = false;
  await page.route('https://api.github.com/**', route => fail ? route.fulfill({ status: 503, body: '' }) : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tag_name: `android-${latest}`, assets: [{ name: 'AvilonX.apk', browser_download_url: `https://github.com/JMacailao/Mayma-Clocking/releases/download/android-${latest}/AvilonX.apk` }] }) }));
  await app(sample + `F.rpc.public_result_clubs=[];F.rpc.has_admin_account=true;F.session={user:{id:'u8'}};F.tables.app_profiles=[{id:'u8',role:'member',member_id:8,username:'ana',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Club'}];`);
  await page.setViewportSize({ width: 390, height: 800 });
  const banner = page.locator('[data-app-update]'), checkButton = page.locator('[data-app-check]');
  const openApp = async (version, query = true) => { await page.goto(`${BASE}/repo/pages/member/dashboard/index.html${query ? `?app=android&appVersion=${version}` : ''}`); await page.waitForSelector('.member-bottom-nav'); await page.waitForTimeout(800); };
  const toast = async () => (await page.locator('[data-toast-stack]').innerText().catch(() => '')).replace(/\s+/g, ' ');

  // Older app, newer release: Update with the release's APK.
  await openApp(3);
  const link = banner.locator('[data-app-update-go]');
  check(await banner.isVisible() && /1\.0\.4/.test(await banner.innerText()) && await link.getAttribute('href') === 'https://github.com/JMacailao/Mayma-Clocking/releases/download/android-1.0.4/AvilonX.apk', 'older app: Update to 1.0.4');
  await banner.locator('[data-app-update-later]').click();
  await openApp(3);
  check(await banner.count() === 0, 'Later: not shown again by itself');
  await page.locator('.member-bottom-nav [data-open-menu]').click(); await page.waitForTimeout(400);
  await checkButton.click(); await page.waitForTimeout(500);
  check(await banner.isVisible(), 'Check for updates still offers it after Later');

  // Same version as the release: no banner; the check says it is the latest.
  await page.evaluate(() => localStorage.removeItem('avilonx.androidUpdateLater'));
  await openApp(4);
  check(await banner.count() === 0, 'latest app: no Update banner');
  await page.locator('.member-bottom-nav [data-open-menu]').click(); await page.waitForTimeout(400);
  check(await checkButton.isVisible() && /1\.0\.4/.test(await checkButton.innerText()), 'menu: Check for updates with the installed version');
  await checkButton.click(); await page.waitForTimeout(500);
  check(/Your app is the latest version\. \(1\.0\.4\)/.test(await toast()) && await banner.count() === 0, 'latest app: says so, no Update');

  // GitHub unreachable: explains, offers nothing.
  fail = true; await checkButton.click(); await page.waitForTimeout(500);
  check(/Could not check for updates/.test(await toast()) && await banner.count() === 0, 'offline: explains');
  fail = false;

  // A new release later: Update appears by itself.
  latest = '1.0.5'; await openApp(4);
  check(await banner.isVisible() && /1\.0\.5/.test(await banner.innerText()), 'new release: Update appears');

  // In a normal browser (not the app): no button, no banner.
  await page.evaluate(() => localStorage.clear());
  await openApp(0, false);
  check(await banner.count() === 0 && await checkButton.isHidden(), 'browser: no app update button or banner');
};
