// Two tags read together by the ACR122U helper: the admin Clocking page clocks
// both, one after the other (none is dropped while the first is being sent).
module.exports = async (page, { open, check, sample }) => {
  let calls = 0;
  await page.route('http://127.0.0.1:47321/**', route => {
    calls++;
    // First answer: nothing yet. Then the two tags at once, then nothing more.
    const body = calls === 1 ? { ok: true, app: 'avilonx-acr122u', reader: 'ACR122U', seq: 0, tags: [] }
      : calls === 2 ? { ok: true, app: 'avilonx-acr122u', reader: 'ACR122U', seq: 2, tags: [{ seq: 1, uid: '843519DB' }, { seq: 2, uid: '6C811F4A' }] }
      : { ok: true, app: 'avilonx-acr122u', reader: 'ACR122U', seq: 2, tags: [] };
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  // Each clocking takes a moment, so the second tag arrives while the first is still sending.
  await open('/repo/pages/admin/clocking/page.js', sample + `F.rpc.admin_record_clock=async a=>{await new Promise(r=>setTimeout(r,300));return {status:'accepted',message:'Clocked entry '+a.p_entry_id};};`);
  await page.waitForFunction(() => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === 'admin_record_clock').length >= 2, null, { timeout: 8000 }).catch(() => {});
  const clocked = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === 'admin_record_clock').map(o => o[2].p_entry_id));
  check(JSON.stringify(clocked) === '[11,13]', `both tags clocked, in the order read (${JSON.stringify(clocked)})`);
};
