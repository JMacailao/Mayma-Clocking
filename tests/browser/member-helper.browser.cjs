// Member Clocking on a laptop takes taps from the AvilonX ACR122U helper
// (which sends tags to the page instead of typing them).
module.exports = async (page, { open, check, sample }) => {
  let calls = 0;
  await page.route('http://127.0.0.1:47321/**', route => {
    calls++;
    const body = calls === 1 ? { ok: true, app: 'avilonx-acr122u', reader: 'ACS ACR122U PICC Interface 0', seq: 0, tags: [] }
      : calls === 2 ? { ok: true, app: 'avilonx-acr122u', reader: 'ACS ACR122U PICC Interface 0', seq: 1, tags: [{ seq: 1, uid: '843519DB' }] }
      : { ok: true, app: 'avilonx-acr122u', reader: 'ACS ACR122U PICC Interface 0', seq: 1, tags: [] };
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  await open('/repo/pages/member/clocking/page.js', sample + `F.identity={profile:{role:'member',member_id:7,club_id:1}};F.rpc.submit_member_nfc_clock=a=>({status:'accepted',message:'Clocked.',pigeon_ring:'PH-1',race:'Batangas Derby',received_at_utc:new Date().toISOString(),receipt_id:92});`);
  await page.waitForFunction(() => window.FAKE.ops.some(o => o[0] === 'rpc' && o[1] === 'submit_member_nfc_clock'), null, { timeout: 8000 }).catch(() => {});
  const sent = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'rpc' && o[1] === 'submit_member_nfc_clock').map(o => o[2].p_tag));
  check(JSON.stringify(sent) === '["843519DB"]', `the helper's tap is clocked (${JSON.stringify(sent)})`);
};
