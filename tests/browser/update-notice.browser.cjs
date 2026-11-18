// "AvilonX was updated" notice when a new version is published.
module.exports = async (page, { open, check }) => {
  let version = '"v1"';
  await page.route('**/assets/js/app.js', route => route.request().method() === 'HEAD' ? route.fulfill({ status: 200, headers: { etag: version }, body: '' }) : route.continue());
  await open('/repo/assets/js/i18n.js', '', { fn: 'getLang' });
  await page.evaluate(async () => (await import('/repo/assets/js/update-check.js')).startUpdateCheck());
  await page.waitForTimeout(400);
  check((await page.locator('.update-banner').count()) === 0, 'no notice while nothing changed');
  version = '"v2"';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(500);
  check(/AvilonX was updated/.test(await page.locator('.update-banner').innerText().catch(() => '')), 'notice after an update');
};
