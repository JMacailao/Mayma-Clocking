// One device per account: asked at sign-in, signed out when replaced, Club settings switch.
module.exports = async (page, { app, open, check, BASE, toast }) => {
  const rpcCalls = name => page.evaluate(n => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === n).map(o => o[2]), name);
  const base = `F.rpc.has_admin_account=true;F.rpc.public_result_clubs=[];F.signIn={id:'u1'};F.tables.app_profiles=[{id:'u1',role:'admin',username:'clubadmin',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'Club'}];`;
  // Another device holds the account: the question is asked; Cancel keeps that device.
  await app(base + `F.rpc.claim_account_device=a=>a.p_force?{status:'ok'}:{status:'other_device',device_label:'Chrome on Windows',last_seen_at:new Date(Date.now()-5*60e3).toISOString()};`);
  await page.goto(`${BASE}/repo/pages/login/index.html`); await page.waitForSelector('#login-form');
  let question = '';
  page.once('dialog', d => { question = d.message(); d.dismiss(); });
  await page.fill('[name=username]', 'clubadmin'); await page.fill('[name=password]', 'secret123'); await page.click('#login-form button[type=submit]'); await page.waitForTimeout(800);
  check(/signed in on another device \(Chrome on Windows, active 5 minutes ago\)/.test(question), `asks before signing the other device out (${question.slice(0, 80)})`);
  check(/stays signed in on the other device/.test(await page.locator('[data-login-message]').innerText()), 'Cancel: not signed in here');
  check(!(await rpcCalls('claim_account_device')).some(a => a.p_force), 'Cancel: the other device is not signed out');
  // OK signs the other device out and continues here.
  page.once('dialog', d => d.accept());
  await page.click('#login-form button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 8000 }).catch(() => {});
  check(/admin\/dashboard/.test(page.url()), 'OK: signed in here');
  // On the device that was taken over: signed out within the next check.
  await app(base + `F.session={user:{id:'u1'}};F.rpc.check_account_device={status:'replaced',device_label:'Safari on iPhone'};F.tables.races=[];F.tables.members=[];F.tables.race_points=[];F.tables.race_entries=[];`);
  await page.goto(`${BASE}/repo/pages/admin/dashboard/index.html`); await page.waitForURL(/signedout=device/, { timeout: 8000 }).catch(() => {});
  check(/login\/index\.html\?signedout=device/.test(page.url()), 'the replaced device is sent to sign in');
  await page.waitForSelector('[data-login-message]:not([hidden])', { timeout: 5000 }).catch(() => {});
  check(/signed in on another device/.test(await page.locator('[data-login-message]').innerText().catch(() => '')), 'and told why');
  // Club settings switch.
  await open('/repo/pages/admin/settings/page.js', `F.tables.clubs=[{id:1,name:'Club',rfid_entry_sticker:'required',single_device:false}];F.rpc.admin_update_club_settings={};F.rpc.admin_set_single_device={};`);
  check(await page.locator('[name=single_device][value=off]').isChecked(), 'off by default');
  await page.check('[name=single_device][value=on]'); await page.click('[data-save-settings]'); await page.waitForTimeout(300);
  check((await rpcCalls('admin_set_single_device')).at(-1)?.p_on === true, 'turning it on is saved');
  check(/one device per account/.test(await toast()), 'confirms the setting');
};
