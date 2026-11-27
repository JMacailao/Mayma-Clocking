// My coordinates (admin and member): the phone's location in degrees, minutes,
// seconds with 2 decimals; blocked location explained.
module.exports = async (page, { open, check, BASE }) => {
  const context = page.context();
  await context.grantPermissions(['geolocation'], { origin: BASE });
  await context.setGeolocation({ latitude: 12.879519, longitude: 121.448333, accuracy: 8 });
  await open('/repo/assets/js/my-coordinates.js');
  await page.click('[data-get-coords]');
  await page.waitForSelector('[data-coords-result]:not([hidden])', { timeout: 5000 }).catch(() => {});
  const lat = await page.locator('[data-coords-lat]').innerText().catch(() => ''), lng = await page.locator('[data-coords-lng]').innerText().catch(() => '');
  check(lat === "N 12°52'46.27" && lng === "E 121°26'54.00", `degrees, minutes, seconds with 2 decimals (${lat} ${lng})`);
  check(/about 8 m/.test(await page.locator('[data-coords-extra]').innerText()), 'shows the accuracy');
  check(/google\.com\/maps\?q=12\.879519/.test(await page.locator('[data-map-coords]').getAttribute('href')), 'opens the spot on Google Maps');
  const m = await page.evaluate(async () => { const c = await import('/repo/assets/js/my-coordinates.js'); return [c.dmsText(-33.8688, 'latitude'), c.dmsText(151.2093, 'longitude'), c.dmsText(14.99999999, 'latitude'), c.dmsText(null, 'latitude')]; });
  check(JSON.stringify(m) === JSON.stringify(["S 33°52'07.68", "E 151°12'33.48", "N 15°00'00.00", '—']), `south, west and rounding ${JSON.stringify(m)}`);
  // Location blocked.
  await context.clearPermissions();
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, fail) => fail({ code: 1 }); });
  await page.click('[data-get-coords]');
  check(/Location is blocked/.test(await page.locator('[data-coords-status]').innerText()), 'blocked location is explained');
};
