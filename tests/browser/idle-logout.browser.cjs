// 15 minutes without any action: a notice at 14 minutes, then signed out
// (admin, member and Super Admin). Any tap keeps the session; the race-day Big
// screen keeps it too; coming back to an old session signs out at once.
module.exports = async (page, { app, check, BASE, sample }) => {
  const route = () => page.evaluate(() => sessionStorage.getItem('avilonx.route'));
  for (const role of ['member', 'admin', 'superadmin']) {
    const profile = role === 'member' ? { id: 'u', role, member_id: 8, username: 'ana', club_id: 1, is_active: true } : role === 'admin' ? { id: 'u', role, username: 'admin', club_id: 1, is_active: true } : { id: 'u', role, username: 'super', is_active: true };
    await app(sample + `F.session=sessionStorage.getItem('test.signedOut')?null:{user:{id:'u'}};F.tables.app_profiles=[${JSON.stringify(profile)}];F.tables.clubs=[{id:1,name:'Club'}];F.rpc.has_admin_account=true;F.rpc.check_account_device={status:'ok'};F.rpc.claim_account_device={status:'ok'};F.rpc.member_list_rfid_devices=[];F.rpc.setup_status={};F.rpc.superadmin_list_rfid_devices=[];F.rpc.public_result_clubs=[];`);
    await page.addInitScript(() => { if (/signedout=/.test(location.search)) sessionStorage.setItem('test.signedOut', '1'); });
    await page.clock.install();
    await page.goto(`${BASE}/repo/pages/${role === 'superadmin' ? 'superadmin/clubs' : `${role}/dashboard`}/index.html`);
    await page.waitForTimeout(800);
    await page.clock.fastForward('14:05');
    await page.waitForTimeout(300);
    check(await page.locator('.idle-notice').isVisible().catch(() => false), `${role}: a notice one minute before`);
    { const b = await page.locator('.idle-notice button').boundingBox(); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
    check(!(await page.locator('.idle-notice').count()), `${role}: Stay signed in closes it`);
    await page.clock.fastForward('10:00');
    await page.mouse.click(5, 300);
    await page.clock.fastForward('10:00');
    await page.waitForTimeout(300);
    check(!/login/.test(await route() || ''), `${role}: a tap keeps the session (${await route()})`);
    await page.clock.fastForward('15:05');
    await page.waitForFunction(() => sessionStorage.getItem('avilonx.route') === 'pages/login/index.html', null, { timeout: 8000 }).catch(() => {});
    check(await route() === 'pages/login/index.html', `${role}: signed out after 15 minutes (${await route()})`);
    if (role === 'member') {
      await page.waitForSelector('[data-login-message]:not([hidden])', { timeout: 5000 }).catch(() => {});
      check(/15 minutes without any activity/.test(await page.locator('[data-login-message]').innerText().catch(() => '')), 'the sign-in page says why');
    }
    await page.evaluate(() => sessionStorage.clear());
  }
  // Coming back to an old session: signed out at once.
  await page.evaluate(() => { localStorage.setItem('avilonx.lastActivity', String(Date.now() - 20 * 60e3)); sessionStorage.clear(); });
  await page.goto(`${BASE}/repo/pages/member/dashboard/index.html`);
  await page.waitForFunction(() => sessionStorage.getItem('avilonx.route') === 'pages/login/index.html', null, { timeout: 8000 }).catch(() => {});
  check(await route() === 'pages/login/index.html', 'an old session is signed out when opened');
  // The race-day Big screen keeps the session.
  const m = await page.evaluate(async () => { const idle = await import('/repo/assets/js/idle-logout.js'); localStorage.removeItem('avilonx.lastActivity'); document.body.classList.add('raceday-tv-on'); let out = false; idle.watchIdle(() => { out = true; }); return new Promise(r => setTimeout(() => r(out), 1500)); });
  check(m === false, 'not signed out right away');
  await page.clock.fastForward('20:00'); await page.waitForTimeout(200);
  check(await page.evaluate(() => !document.querySelector('.idle-notice')), 'Big screen on: no sign out');
};
