// Billing: Super Admin (clubs for a start/end date, bill, settle, warning,
// close), club admin (settled or not, bills, print), the warning pop-up and
// the closed-club lock screen.
module.exports = async (page, { open, app, check, BASE, sample, toast }) => {
  const rpcs = name => page.evaluate(n => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === n).map(o => o[2]), name);
  await page.addInitScript(() => { window.__printed = []; window.open = () => ({ document: { open() {}, write(h) { window.__printed.push(h); }, close() {} }, addEventListener() {}, print() {}, close() {} }); });
  const summary = `F.rpc.superadmin_billing_summary=[{club_id:1,club_name:'JMB Club',bird_price:5,birds:700,deleted:3,amount:3500,unbilled:120,unbilled_amount:600,unpaid_bills:1,unpaid_amount:2100,is_closed:false,closed_reason:null,open_warnings:1},{club_id:2,club_name:'Lipa Flyers',bird_price:5,birds:50,deleted:0,amount:250,unbilled:0,unbilled_amount:0,unpaid_bills:0,unpaid_amount:0,is_closed:true,closed_reason:'Unpaid',open_warnings:0}];
    F.rpc.billing_bills=[{id:11,club_id:1,start_date:'2026-11-01',end_date:'2026-11-15',birds:420,amount:2100,created_at:'2026-11-16T01:00:00Z',settled_at:null},{id:10,club_id:1,start_date:'2026-10-01',end_date:'2026-10-31',birds:600,amount:3000,created_at:'2026-11-01T01:00:00Z',settled_at:'2026-11-02T01:00:00Z',paid_on:'2026-11-02',pay_method:'GCash',pay_reference:'REF9',invoice_no:'AVX-2026-0001'}];
    F.rpc.superadmin_billing_warnings=[{id:1,message:'Please pay',created_at:'2026-11-20T01:00:00Z',seen_at:null}];F.rpc.superadmin_billing_log=[];
    F.rpc.superadmin_create_bill=a=>({id:12,start_date:a.p_start,end_date:a.p_end,birds:120,amount:600});F.rpc.superadmin_settle_bill=a=>({id:a.p_bill_id,invoice_no:'AVX-2026-0002'});
    F.rpc.superadmin_send_warning=null;F.rpc.superadmin_set_club_closed=null;F.rpc.superadmin_set_bird_price=null;
    F.rpc.billing_entries=[{id:1,encoded_at:'2026-11-03T01:00:00Z',race_name:'Derby',member_no:'161',member_name:'Ana',pigeon_ring:'PH-1',price:5,deleted:false,bill_id:11},{id:2,encoded_at:'2026-11-04T01:00:00Z',race_name:'Derby',member_no:'161',member_name:'Ana',pigeon_ring:'PH-2',price:5,deleted:true,bill_id:11}];`;
  await open('/repo/pages/superadmin/billing/page.js', summary);
  const rowsText = await page.locator('.billing-table tbody').innerText();
  check(/JMB Club/.test(rowsText) && /700/.test(rowsText) && /3 deleted, billed/.test(rowsText) && /Not settled · ₱2,100\.00/.test(rowsText) && /Closed/.test(rowsText), `clubs with birds, amount, status (${rowsText.replace(/\s+/g, ' ').slice(0, 200)})`);
  check(/750 birds · ₱3,750\.00 · not settled ₱2,100\.00/.test(await page.locator('[data-bill-totals]').innerText()), 'totals');
  const firstCall = (await rpcs('superadmin_billing_summary'))[0];
  check(/^\d{4}-\d{2}-01$/.test(firstCall.p_start) && firstCall.p_end >= firstCall.p_start, `this month by default ${JSON.stringify(firstCall)}`);
  await page.click('[data-bill-quick="last"]'); await page.waitForTimeout(200);
  const last = (await rpcs('superadmin_billing_summary')).at(-1);
  check(last.p_start < firstCall.p_start && last.p_end < firstCall.p_start, `Last month ${JSON.stringify(last)}`);
  await page.check('[data-only-unsettled]');
  check(await page.locator('.billing-table tbody tr').count() === 1, 'Not settled only');
  // One club.
  await page.click('[data-open-club="1"]'); await page.waitForTimeout(300);
  check(await page.inputValue('[data-new-start]') === '2026-11-16', 'the next bill starts after the last one');
  await page.fill('[data-new-end]', '2026-11-20'); await page.click('[data-create-bill]'); await page.waitForTimeout(300);
  check(JSON.stringify((await rpcs('superadmin_create_bill'))[0]) === JSON.stringify({ p_club_id: 1, p_start: '2026-11-16', p_end: '2026-11-20' }), 'bill for the chosen dates');
  await page.click('[data-settle="11"]'); await page.fill('[data-settle-form="11"] [name=reference]', 'GC123'); await page.click('[data-settle-form="11"] [type=submit]'); await page.waitForTimeout(300);
  const settle = (await rpcs('superadmin_settle_bill'))[0];
  check(settle?.p_bill_id === 11 && settle.p_method === 'GCash' && settle.p_reference === 'GC123', `settle ${JSON.stringify(settle)}`);
  check(/AVX-2026-0002/.test(await toast()), 'invoice number shown');
  check(/Unpaid AvilonX bill: Nov 1, 2026 – Nov 15, 2026 \(₱2,100\.00\)/.test(await page.inputValue('[data-warning-text]')), 'warning written from the unpaid bill');
  await page.click('[data-send-warning]'); await page.waitForTimeout(200);
  check((await rpcs('superadmin_send_warning'))[0]?.p_bill_id === 11, 'warning sent');
  page.once('dialog', d => d.accept());
  await page.click('[data-close-account]'); await page.waitForTimeout(200);
  const closed = (await rpcs('superadmin_set_club_closed'))[0];
  check(closed?.p_closed === true && /Unpaid bill/.test(closed.p_reason), `close account ${JSON.stringify(closed)}`);
  page.once('dialog', d => d.accept());
  await page.click('[data-print="10"]'); await page.waitForTimeout(400);
  const printed = await page.evaluate(() => window.__printed.at(-1) || '');
  check(/INVOICE/.test(printed) && /AVX-2026-0001/.test(printed) && /PAID/.test(printed) && /Oct 1, 2026 – Oct 31, 2026/.test(printed) && /Birds encoded \(0\)/.test(printed), 'settled bill prints the invoice (with its bird list)');
  page.once('dialog', d => d.dismiss());
  await page.click('[data-print="11"]'); await page.waitForTimeout(300);
  check(/BILLING STATEMENT/.test(await page.evaluate(() => window.__printed.at(-1))) && /NOT SETTLED/.test(await page.evaluate(() => window.__printed.at(-1))), 'unsettled bill prints a statement');

  // Club admin.
  await open('/repo/pages/admin/billing/page.js', summary + `F.rpc.club_billing_status={club_id:1,club_name:'JMB Club',bird_price:5,unpaid_bills:1,unpaid_amount:2100,unbilled:120,unbilled_amount:600};`);
  check(/Not settled/.test(await page.locator('[data-billing-status]').innerText()) && /₱2,100\.00/.test(await page.locator('[data-billing-status]').innerText()), 'club admin: not settled');
  const bills = await page.locator('.billing-bills').innerText();
  check(/Nov 1, 2026 – Nov 15, 2026/.test(bills) && /Settled/.test(bills) && /AVX-2026-0001/.test(bills) && !(await page.locator('[data-settle]').count()), 'club admin: bills, read only');
  check(/2 birds · ₱10\.00/.test(await page.locator('[data-birds-count]').innerText()) && /Deleted · billed/.test(await page.locator('[data-birds-list]').innerText()), 'club admin: birds encoded for the dates');
  await open('/repo/pages/admin/billing/page.js', summary + `F.rpc.club_billing_status={club_id:1,club_name:'JMB Club',bird_price:5,unpaid_bills:0,unpaid_amount:0,unbilled:0,unbilled_amount:0};`);
  check(/All settled/.test(await page.locator('[data-billing-status]').innerText()), 'club admin: all settled');

  // Warning pop-up and lock screen (whole app, club admin).
  const base = `F.rpc.has_admin_account=true;F.rpc.check_account_device={status:'ok'};F.session={user:{id:'u'}};F.tables.app_profiles=[{id:'u',role:'admin',username:'admin',club_id:1,is_active:true}];F.tables.clubs=[{id:1,name:'JMB Club'}];F.rpc.club_dismiss_warning=null;`;
  await app(sample + base + `F.rpc.club_account_status={is_closed:false,warnings:[{id:7,message:'Unpaid AvilonX bill: Nov 1–15 (₱2,100). Please pay.',created_at:'2026-11-20T01:00:00Z'}]};`);
  await page.goto(`${BASE}/repo/pages/admin/dashboard/index.html`);
  await page.waitForSelector('dialog.club-warning[open]', { timeout: 8000 }).catch(() => {});
  check(/Please pay/.test(await page.locator('dialog.club-warning').innerText().catch(() => '')), 'warning pops up for the club admin');
  await page.click('[data-warning-close]'); await page.waitForTimeout(300);
  check(!(await page.locator('dialog.club-warning').count()) && (await rpcs('club_dismiss_warning'))[0]?.p_id === 7, 'closing it marks it seen');
  await app(sample + base + `F.rpc.club_account_status={is_closed:true,closed_reason:'Unpaid bill Nov 1–15 (₱2,100)',club_name:'JMB Club',warnings:[]};`);
  await page.goto(`${BASE}/repo/pages/admin/members/index.html`);
  await page.waitForSelector('.club-lock', { timeout: 8000 }).catch(() => {});
  const lock = await page.locator('.club-lock').innerText().catch(() => '');
  check(/This club account is closed/.test(lock) && /Unpaid bill Nov 1–15/.test(lock) && !(await page.locator('#app-sidebar').count()), `closed club: lock screen only (${lock.replace(/\s+/g, ' ')})`);
  await page.click('[data-lock-signout]'); await page.waitForTimeout(800);
  check(await page.evaluate(() => sessionStorage.getItem('avilonx.route')) === 'pages/login/index.html', 'Sign out works from the lock screen');
};
