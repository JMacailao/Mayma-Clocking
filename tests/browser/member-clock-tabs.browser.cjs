// Member clocking: Sticker (first, default) and Eclock tabs.
module.exports = async (page, { open, check, sample, OUT }) => {
  const member = sample + `F.identity={profile:{role:'member',member_id:7,club_id:1}};`;
  await open('/repo/pages/member/clocking/page.js', member, { viewport: { width: 390, height: 800 } });
  const tabs = page.locator('[role="tab"][data-clock-tab]');
  check((await tabs.allInnerTexts()).join('|') === 'Sticker|Eclock', 'tabs: Sticker first, then Eclock');
  const sticker = page.locator('[data-clock-panel="sticker"]'), eclock = page.locator('[data-clock-panel="eclock"]');
  check(await sticker.isVisible() && !(await eclock.isVisible()) && await tabs.first().getAttribute('aria-selected') === 'true', 'Sticker shown by default');
  check(/Clock with sticker scratch code/.test(await sticker.innerText()), 'Sticker tab: the scratch code form');
  await page.screenshot({ path: `${OUT}/member-clock-tabs-390.png` });

  await tabs.nth(1).click();
  check(await eclock.isVisible() && !(await sticker.isVisible()) && /Clock with NFC tag/.test(await eclock.innerText()), 'Eclock tab: NFC tag clocking');
  await tabs.nth(1).focus(); await page.keyboard.press('ArrowLeft');
  check(await sticker.isVisible() && await page.evaluate(() => document.activeElement.dataset.clockTab) === 'sticker', 'arrow keys switch tabs');
  await page.keyboard.press('ArrowRight');

  await open('/repo/pages/member/clocking/page.js', member, { viewport: { width: 390, height: 800 } });
  check(await page.locator('[data-clock-panel="eclock"]').isVisible(), 'last tab remembered');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: fits the screen');
};
