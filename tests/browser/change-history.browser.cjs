// Change history: who changed what.
module.exports = async (page, { open, check }) => {
  await open('/repo/pages/admin/history/page.js', `F.tables.audit_log=[
   {id:2,table_name:'race_entries',action:'update',row_id:11,changed_at:'2026-11-18T10:00:00Z',changed_by_name:'admin1',old_data:{id:11,pigeon_ring:'PH-1',barcode:'111'},new_data:{id:11,pigeon_ring:'PH-1',barcode:'999'}},
   {id:1,table_name:'clock_events',action:'insert',row_id:101,changed_at:'2026-11-18T09:00:00Z',changed_by_name:'RFID reader / system',old_data:null,new_data:{id:101,pigeon_ring:'PH-1',verification:'provisional'}}];`);
  check((await page.locator('.history-item').count()) === 2, 'lists the changes');
  check(/111\s*→\s*999/.test(await page.locator('.history-item').first().innerText()), 'shows the old and new value');
  await page.fill('[data-search]', 'reader');
  check((await page.locator('.history-item').count()) === 1, 'search filters');
  await open('/repo/pages/admin/history/page.js', `F.fail={audit_log:'relation "public.audit_log" does not exist'};`);
  check(/not set up yet/.test(await page.locator('.notice.error').innerText()), 'explains when it is not set up');
};
