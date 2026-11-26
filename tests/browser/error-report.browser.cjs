// A page error is reported once (message, page, browser); the Super Admin
// sees App errors and website club requests on Club accounts.
module.exports = async (page, { open, check, BASE, OUT }) => {
  const reports = [];
  await page.route('https://utfxtwgqdbjkbxlooolr.supabase.co/rest/v1/rpc/log_client_error', route => { reports.push(JSON.parse(route.request().postData())); route.fulfill({ status: 204, body: '' }); });
  await page.route('https://utfxtwgqdbjkbxlooolr.supabase.co/rest/v1/rpc/public_races_today', route => route.fulfill({ json: [] }));
  await page.goto(`${BASE}/repo/index.html`); await page.waitForTimeout(300);
  await page.evaluate(() => { setTimeout(() => { throw new Error('Boom on purpose [expected]'); }); setTimeout(() => { throw new Error('Boom on purpose [expected]'); }, 10); Promise.reject(new Error('Failed to fetch [expected]')); });
  await page.waitForTimeout(600);
  check(reports.length === 1 && reports[0].p_message.includes('Boom on purpose [expected]') && reports[0].p_page === 'index.html' && reports[0].p_user_agent.length > 0, `reported once (${JSON.stringify(reports.map(r => r.p_message))})`);

  await open('/repo/pages/superadmin/clubs/page.js', `F.identity={profile:{role:'superadmin'}};F.rpc.superadmin_list_clubs=[];
    F.rpc.superadmin_club_requests=[{id:1,contact_name:'Pedro Reyes',club_name:'Lipa Flyers',phone:'0917 123 4567',email:'',message:'30 members',created_at:'2026-11-26T01:00:00Z',handled_at:null}];
    F.rpc.superadmin_handle_club_request=null;
    F.rpc.superadmin_client_errors=[{id:1,message:'TypeError: x is undefined',source:'clocking/page.js:10:5',page:'pages/member/clocking/index.html',user_agent:'Mozilla/5.0 (Linux; Android 14)',app_version:'1.0.4',username:'maria',club_name:'Sample Racing Club',count:3,first_at:'2026-11-26T01:00:00Z',last_at:'2026-11-26T02:00:00Z'}];`);
  await page.waitForSelector('[data-app-errors] table', { timeout: 8000 }).catch(() => {});
  const requests = await page.locator('[data-club-requests]').innerText().catch(() => '');
  check(/Lipa Flyers/.test(requests) && /1 new/.test(requests) && await page.locator('[data-club-requests] a[href="tel:09171234567"]').count() === 1, 'club requests listed with a call link');
  await page.click('[data-handle-request="1"]'); await page.waitForTimeout(200);
  check(await page.evaluate(() => window.FAKE.ops.some(o => o[1] === 'superadmin_handle_club_request' && o[2].p_id === 1 && o[2].p_handled === true)), 'Done marks a request handled');
  const errors = await page.locator('[data-app-errors]').innerText();
  check(/TypeError: x is undefined/.test(errors) && /maria · Sample Racing Club/.test(errors) && /Android · app 1\.0\.4/.test(errors), 'App errors listed');
  await page.locator('[data-app-errors]').screenshot({ path: `${OUT}/app-errors.png` });
};
