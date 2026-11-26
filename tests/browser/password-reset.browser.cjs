// Forgot password by email: login page link (members only), reset page with a
// link from the email, confirming an email, and the email on Members / Settings.
module.exports = async (page, { app, open, check, sample, BASE, OUT, toast }) => {
  const base = `F.tables.app_profiles=[];F.tables.clubs=[{id:1,name:'Club'}];F.rpc.has_admin_account=true;`;

  // Login: the link shows only on the Member tab; sending always gives the same answer.
  await app(base + `F.functions={'avilonx-password-reset':b=>({ok:true})};`);
  await page.goto(`${BASE}/repo/pages/login/index.html`); await page.waitForSelector('#login-form');
  check(await page.locator('[data-forgot]').isVisible(), 'club team tab: Forgot password link (admins, Super Admin)');
  await page.click('#audience-member');
  check(await page.locator('[data-forgot]').isVisible(), 'member tab: Forgot password link');
  await page.fill('#login-form [name=username]', 'Ana');
  await page.click('[data-forgot]');
  check(await page.locator('#forgot-form').isVisible() && !(await page.locator('#login-form').isVisible()), 'Forgot password shows its own form');
  check(await page.inputValue('#forgot-form [name=username]') === 'Ana', 'username carried over');
  await page.click('#forgot-form [type=submit]'); await page.waitForTimeout(300);
  const ops = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'function'));
  check(ops.length === 1 && ops[0][1] === 'avilonx-password-reset' && ops[0][2].action === 'reset' && ops[0][2].username === 'ana', `asks the function for a reset link (${JSON.stringify(ops)})`);
  const note = await page.locator('[data-login-message]').innerText();
  check(/If this username has a confirmed email, a reset link was sent/.test(note) && await page.locator('#login-form').isVisible(), `same answer for every username, back to sign in (${note})`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-forgot]'); await page.screenshot({ path: `${OUT}/forgot-password-390.png` });

  // Function not deployed: tells the member to ask the club admin.
  await app(base);
  await page.goto(`${BASE}/repo/pages/login/index.html?audience=member`); await page.waitForSelector('#login-form');
  check(await page.locator('#audience-member').getAttribute('aria-selected') === 'true', '?audience=member opens the Member tab');
  await page.click('[data-forgot]'); await page.fill('#forgot-form [name=username]', 'ana'); await page.click('#forgot-form [type=submit]'); await page.waitForTimeout(300);
  check(/Ask your club administrator/.test(await page.locator('[data-login-message]').innerText()), 'not set up: ask the club admin');

  // Reset page: code taken out of the address; passwords checked; success.
  await app(base + `F.rpc.password_reset_complete=a=>a.p_token==='abc'&&a.p_password==='newpass123'?{username:'ana',role:'member'}:{__error:{message:'This reset link has expired or was already used. Ask for a new one.'}};`);
  await page.goto(`${BASE}/repo/pages/reset-password/index.html?reset=abc`); await page.waitForSelector('#reset-form');
  check(!page.url().includes('abc'), `code removed from the address (${page.url()})`);
  await page.fill('[name=password]', 'newpass123'); await page.fill('[name=again]', 'different1'); await page.click('#reset-form [type=submit]');
  check(/do not match/.test(await page.locator('[data-reset-message]').innerText()), 'mismatched passwords refused');
  await page.screenshot({ path: `${OUT}/reset-page-390.png` });
  await page.fill('[name=again]', 'newpass123'); await page.click('#reset-form [type=submit]'); await page.waitForTimeout(300);
  const done = await page.locator('#reset-content').innerText();
  check(/Password changed/.test(done) && /ana/.test(done), `password changed (${done})`);
  await page.click('.reset-login'); await page.waitForSelector('#login-form');
  check(/Password changed/.test(await page.locator('[data-login-message]').innerText()) && await page.locator('#audience-member').getAttribute('aria-selected') === 'true', 'sign-in page: member tab and a note');
  await page.goto(`${BASE}/repo/pages/reset-password/index.html?reset=old`); await page.waitForSelector('#reset-form');
  await page.fill('[name=password]', 'newpass123'); await page.fill('[name=again]', 'newpass123'); await page.click('#reset-form [type=submit]'); await page.waitForTimeout(300);
  check(/expired or was already used/.test(await page.locator('[data-reset-message]').innerText()), 'old link: says so');

  // Confirming an email.
  await app(base + `F.rpc.confirm_member_email=a=>a.p_token==='c1'?{email:'ana@example.com'}:{__error:{message:'This confirmation link has expired or was already used.'}};`);
  await page.goto(`${BASE}/repo/pages/reset-password/index.html?confirm=c1`); await page.waitForTimeout(800);
  check(/Email confirmed/.test(await page.locator('#reset-content').innerText()), 'email confirmed');
  await page.goto(`${BASE}/repo/pages/reset-password/index.html`); await page.waitForTimeout(800);
  check(/Link not complete/.test(await page.locator('#reset-content').innerText()), 'no code: link not complete');

  // Member Settings: add an email, a confirmation link is sent.
  const member = sample + `F.identity={profile:{role:'member',member_id:7,club_id:1,username:'ana'}};F.rpc.account_set_email=a=>({email:a.p_email,confirmed:false});F.functions={'avilonx-password-reset':b=>({ok:true,sent:true,email:'ana@example.com'})};`;
  await open('/repo/pages/member/settings/page.js', member, { viewport: { width: 390, height: 900 } });
  check(/No email yet/.test(await page.locator('[data-email-panel]').innerText()), 'Settings: no email yet');
  await page.fill('[data-email-form] [name=email]', 'Ana@Example.com'); await page.click('[data-email-form] [type=submit]'); await page.waitForTimeout(300);
  const sent = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'function' || o[1] === 'account_set_email').map(o => o[1] + ':' + JSON.stringify(o[2])));
  check(sent.some(s => s.startsWith('account_set_email:{"p_email":"ana@example.com"}')) && sent.some(s => s.includes('"action":"confirm","member_id":7')), `email saved and link sent (${sent})`);
  const panelText = await page.locator('[data-email-panel]').innerText(), noteText = await toast();
  check(/Not confirmed/.test(panelText) && /confirmation link was sent/.test(noteText), `shows Not confirmed and the note (${panelText} | ${noteText})`);
  await page.locator('[data-email-panel]').screenshot({ path: `${OUT}/settings-email-390.png` });

  // Members (club admin): email column with its status; Send link again.
  await app(sample + `F.session={user:{id:'u'}};F.tables.app_profiles=[{id:'u',role:'admin',username:'admin',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Club'}];F.tables.race_points=[];
    F.tables.members.forEach((m,i)=>{m.club_id=1;m.latitude=14;m.longitude=121;m.email=i===0?'ana@example.com':i===1?'ben@example.com':null;m.email_confirmed_at=i===0?'2026-11-01T00:00:00Z':null;});
    F.functions={'avilonx-password-reset':b=>({ok:true,sent:true,email:'ben@example.com'})};`);
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}/repo/pages/admin/members/index.html`); await page.waitForSelector('[data-send-confirm]', { timeout: 8000 }).catch(() => {});
  const text = await page.locator('.page-view').innerText();
  check(/ana@example.com/.test(text) && /Confirmed/.test(text) && /Not confirmed/.test(text), 'Members: emails with Confirmed / Not confirmed');
  check(await page.locator('#record-form [name=email]').count() === 1, 'Members form has an email field');
  await page.locator('[data-send-confirm]').first().click(); await page.waitForTimeout(300);
  check(/confirmation link was sent to ben@example.com/.test(await toast()), 'Send link again sends the confirmation');

  // Club administrator: own email on Club settings; reset link sends them to the Club team tab.
  await app(`F.session={user:{id:'u'}};F.tables.app_profiles=[{id:'u',role:'admin',username:'admin',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Club',rfid_entry_sticker:'optional'}];
    F.rpc.account_email_status={email:null,confirmed:false};F.rpc.account_set_email=a=>a.p_email==='taken@club.ph'?{__error:{message:'This email is already used by another account. Use a different email.'}}:({email:a.p_email,confirmed:false});
    F.functions={'avilonx-password-reset':b=>({ok:true,sent:true,email:'boss@club.ph'})};`);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}/repo/pages/admin/settings/index.html`); await page.waitForSelector('[data-email-form]', { timeout: 8000 }).catch(() => {});
  check(/Email for password reset/.test(await page.locator('[data-email-panel]').innerText().catch(() => '')), 'Club settings: email box for the admin');
  await page.fill('[data-email-form] [name=email]', 'taken@club.ph'); await page.click('[data-email-form] [type=submit]'); await page.waitForTimeout(300);
  check(/already used by another account/.test(await toast()), 'an email already on another account is refused');
  await page.fill('[data-email-form] [name=email]', 'boss@club.ph'); await page.click('[data-email-form] [type=submit]'); await page.waitForTimeout(300);
  const adminOps = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'function').map(o => JSON.stringify(o[2])));
  check(adminOps.some(o => o === '{"action":"confirm","member_id":null}'), `confirmation for the admin's own account (${adminOps})`);
  check(/Not confirmed/.test(await page.locator('[data-email-panel]').innerText()), 'admin email shows Not confirmed');

  // Super Admin: own email on Setup.
  await app(`F.session={user:{id:'s'}};F.tables.app_profiles=[{id:'s',role:'superadmin',username:'super',is_active:true}];F.rpc.setup_status={};F.rpc.account_email_status={email:'super@avilonx.site',confirmed:true};`);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}/repo/pages/superadmin/setup/index.html`); await page.waitForSelector('[data-email-form]', { timeout: 8000 }).catch(() => {});
  const superText = await page.locator('[data-email-panel]').innerText().catch(() => '');
  check(/Confirmed/.test(superText) && /super@avilonx.site/.test(superText), `Setup: Super Admin email confirmed (${superText})`);

  // Reset of a club team account: back to the Club team tab.
  await app(base + `F.rpc.password_reset_complete={username:'admin',role:'admin'};`);
  await page.goto(`${BASE}/repo/pages/reset-password/index.html?reset=t1`); await page.waitForSelector('#reset-form');
  await page.fill('[name=password]', 'newpass123'); await page.fill('[name=again]', 'newpass123'); await page.click('#reset-form [type=submit]'); await page.waitForTimeout(300);
  await page.click('.reset-login'); await page.waitForSelector('#login-form');
  check(await page.locator('#audience-team').getAttribute('aria-selected') === 'true', 'admin reset: sign in on the Club team tab');
};
