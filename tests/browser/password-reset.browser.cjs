// Forgot password by email: recovery email on Club settings (admin) and member
// Settings, "Forgot password?" on sign-in, and the emailed link's page.
module.exports = async (page, { open, app, check, sample, BASE, OUT }) => {
  // Club administrator first: Club settings → Recovery email.
  await open('/repo/pages/admin/settings/page.js', `F.identity={profile:{id:'u1',role:'admin',club_id:1}};F.tables.clubs=[{id:1,name:'Club',rfid_entry_sticker:'required'}];F.tables.app_profiles=[{id:'u1',role:'admin',club_id:1,recovery_email:null}];F.rpc.set_my_recovery_email=a=>a.p_email.trim().toLowerCase()||null;`);
  const adminForm = page.locator('[data-recovery-email] form');
  check(await adminForm.isVisible(), 'Club settings: recovery email field');
  await adminForm.locator('[name=email]').fill(' Club.Admin@Gmail.com '); await adminForm.locator('button').click(); await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === 'set_my_recovery_email').at(-1)?.[2]);
  check(saved?.p_email?.trim() === 'Club.Admin@Gmail.com' && await adminForm.locator('[name=email]').inputValue() === 'club.admin@gmail.com', 'saved (cleaned by the database)');

  // Members: Settings → Recovery email.
  await open('/repo/pages/member/settings/page.js', sample + `F.identity={profile:{id:'u8',role:'member',member_id:8,username:'ana',club_id:1}};F.tables.app_profiles=[{id:'u8',role:'member',member_id:8,username:'ana',recovery_email:'ana@gmail.com'}];`);
  check(await page.locator('[data-recovery-email] [name=email]').inputValue() === 'ana@gmail.com', 'member Settings: shows the saved email');

  // Sign-in page: Forgot password? → link by email.
  await app(`F.rpc.has_admin_account=true;F.rpc.public_result_clubs=[];F.fn={'avilonx-password-reset':b=>b.action==='request'?{ok:true,message:'If this account has a recovery email, a reset link is on its way. No email? Ask your club administrator.'}:b.token==='a'.repeat(64)?{ok:true,username:'clubadmin'}:{__error:{ok:false,message:'This link has expired or was already used. Ask for a new one.'}}};`);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/repo/pages/login/index.html`); await page.waitForSelector('#login-form');
  await page.fill('#login-form [name=username]', 'ClubAdmin');
  await page.click('[data-forgot]');
  check(await page.locator('#forgot-form [name=username]').inputValue() === 'clubadmin', 'Forgot password: username carried over');
  await page.click('#forgot-form [type=submit]'); await page.waitForTimeout(300);
  const request = await page.evaluate(() => window.FAKE.ops.find(o => o[0] === 'fn')?.[2]);
  check(request?.action === 'request' && request.username === 'clubadmin' && /reset link is on its way/.test(await page.locator('[data-login-message]').innerText()), 'asks the reset service and says the link is on its way');
  await page.screenshot({ path: `${OUT}/forgot-password-390.png` });
  await page.click('[data-back]');
  check(await page.locator('#login-form').isVisible(), 'Back to sign in');

  // The emailed link: set a new password.
  await page.goto(`${BASE}/repo/pages/login/index.html?reset=${'a'.repeat(64)}`); await page.waitForSelector('#reset-form');
  await page.fill('#reset-form [name=password]', 'newpass123'); await page.fill('#reset-form [name=confirm]', 'different1');
  await page.click('#reset-form [type=submit]');
  check(/not the same/.test(await page.locator('[data-login-message]').innerText()), 'passwords must match');
  await page.fill('#reset-form [name=confirm]', 'newpass123'); await page.click('#reset-form [type=submit]'); await page.waitForTimeout(300);
  const reset = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'fn').at(-1)?.[2]);
  check(reset?.action === 'reset' && reset.token === 'a'.repeat(64) && reset.password === 'newpass123', 'sends the token and new password');
  check(/Password changed/.test(await page.locator('#login-content').innerText()) && /clubadmin/.test(await page.locator('#login-content').innerText()), 'confirms and names the username');
  await page.screenshot({ path: `${OUT}/reset-password-done-390.png` });
  await page.click('[data-signin]');
  check(await page.locator('#login-form').isVisible(), 'then the sign-in form');

  // An old link: explained.
  await page.goto(`${BASE}/repo/pages/login/index.html?reset=${'b'.repeat(64)}`); await page.waitForSelector('#reset-form');
  await page.fill('#reset-form [name=password]', 'newpass123'); await page.fill('#reset-form [name=confirm]', 'newpass123'); await page.click('#reset-form [type=submit]'); await page.waitForTimeout(300);
  check(/expired or was already used/.test(await page.locator('[data-login-message]').innerText()), 'used or expired link: says so');

  // Super Admin: Recovery email for each club administrator.
  await open('/repo/pages/superadmin/clubs/page.js', `F.identity={profile:{role:'superadmin'}};F.rpc.superadmin_list_clubs=[{id:1,name:'Mayma Club',admin_username:'clubadmin'}];F.rpc.superadmin_set_club_admin_email={};`);
  page.once('dialog', d => d.accept('club.admin@gmail.com'));
  await page.locator('[data-email-club="1"]').first().click(); await page.waitForTimeout(300);
  const superSet = await page.evaluate(() => window.FAKE.ops.find(o => o[0] === 'rpc' && o[1] === 'superadmin_set_club_admin_email')?.[2]);
  check(superSet?.p_club_id === 1 && superSet.p_email === 'club.admin@gmail.com', 'Super Admin sets a club administrator\'s email');
};
