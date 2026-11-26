// Landing page: today's races, the demo, the club request form, Tagalog, phone fit.
module.exports = async (page, { check, BASE, OUT }) => {
  const sent = [];
  await page.route('https://utfxtwgqdbjkbxlooolr.supabase.co/rest/v1/rpc/**', async route => {
    const name = route.request().url().split('/').pop(), body = JSON.parse(route.request().postData() || '{}');
    if (name === 'public_races_today') return route.fulfill({ json: [{ club_name: 'Sample Racing Club', race_name: 'Batangas Derby', release_location: 'Batangas', release_at_utc: '2026-11-26 00:00:00', status: 'open', is_practice: false, entries: 12, clocked: 5, best_speed: 1125.4 }] });
    if (name === 'submit_club_request') { sent.push(body); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ status: 404, json: { message: 'unknown' } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/repo/index.html`);
  await page.waitForSelector('[data-today]:not([hidden])', { timeout: 8000 }).catch(() => {});
  const today = await page.locator('[data-today-list]').innerText().catch(() => '');
  check(/Batangas Derby/.test(today) && /5\/12/.test(today) && /1,125\.4/.test(today) && /8:00/.test(today), `Racing today lists the race (${today.replace(/\s+/g, ' ')})`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling on a phone');
  check(await page.locator('video[data-demo] source').count() === 2 && await page.locator('[data-demo-toggle]').isVisible(), 'demo video with a pause button');

  const form = page.locator('[data-contact-form]');
  await form.locator('[name="contact_name"]').fill('Pedro Reyes');
  await form.locator('[name="club_name"]').fill('Lipa Flyers');
  await form.locator('[type="submit"]').click();
  check(/mobile number or an email/.test(await form.locator('[data-contact-status]').innerText()) && sent.length === 0, 'asks for a way to reach you');
  await form.locator('[name="phone"]').fill('0917 123 4567');
  await form.locator('[type="submit"]').click();
  await page.waitForFunction(() => /Request sent/.test(document.querySelector('[data-contact-status]').textContent), null, { timeout: 5000 }).catch(() => {});
  check(sent.length === 1 && sent[0].p_club_name === 'Lipa Flyers' && sent[0].p_phone === '0917 123 4567' && sent[0].p_website === '', `request sent (${JSON.stringify(sent[0])})`);
  await form.screenshot({ path: `${OUT}/landing-contact.png` });

  await page.click('.lp-lang [data-lang="tl"]');
  await page.waitForLoadState('load'); await page.waitForTimeout(400);
  check(/may tamang talaan/.test(await page.locator('h1').innerText()) && await page.evaluate(() => document.documentElement.lang) === 'tl', 'Tagalog switch translates the page');
  check(await page.locator('.lp-lang [data-lang="tl"]').getAttribute('aria-pressed') === 'true', 'TL shows as chosen');
  await page.evaluate(() => localStorage.removeItem('avilonx.lang'));
};
