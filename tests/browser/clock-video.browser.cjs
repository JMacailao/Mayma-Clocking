// Clocking videos: a member adds a short video to a clocking (Clocking history,
// or the receipt after clocking); the club plays it on Show up.
const path = require('path');
module.exports = async (page, { open, check, sample, toast, OUT }) => {
  // Small real videos (webm: the test browser has no H.264), made with ffmpeg testsrc.
  const short = path.join(__dirname, '..', 'fixtures', 'clip-3s.webm'), long = path.join(__dirname, '..', 'fixtures', 'clip-40s.webm');
  const member = sample + `F.identity={profile:{role:'member',member_id:7,club_id:1}};F.rpc.member_save_clock_video=a=>({status:'saved',replaced_path:null});`;

  await open('/repo/pages/member/history/page.js', member);
  const add = page.locator('table [data-add-video="101"]');
  check(await add.count() === 1 && /Add video/.test(await add.innerText()), 'history: each receipt has Add video');
  let chooser = page.waitForEvent('filechooser');
  await add.click();
  const fc = await chooser;
  check(fc.element && /video/.test(await fc.element().getAttribute('accept')) && await fc.element().getAttribute('capture') === 'environment', 'opens the camera or video library');
  await fc.setFiles(short);
  await page.waitForFunction(() => window.FAKE.ops.some(o => o[0] === 'rpc' && o[1] === 'member_save_clock_video'), null, { timeout: 8000 }).catch(() => {});
  const up = await page.evaluate(() => window.FAKE.ops.find(o => o[0] === 'upload'));
  const save = await page.evaluate(() => window.FAKE.ops.find(o => o[0] === 'rpc' && o[1] === 'member_save_clock_video')?.[2]);
  check(up && up[1] === 'clock-videos' && /^1\/7\/101\/\d+\.webm$/.test(up[2]) && up[3] === 'video/webm', `uploads to the member's folder (${JSON.stringify(up)})`);
  check(save && save.p_clock_id === 101 && save.p_path === up[2] && Math.abs(save.p_duration - 3) < 0.6 && save.p_size > 0, `saves it with the clocking (${JSON.stringify(save)})`);
  check(/Video saved/.test(await toast()), 'tells the member it is saved');

  // Too long: refused before uploading.
  await open('/repo/pages/member/history/page.js', member);
  chooser = page.waitForEvent('filechooser');
  await page.locator('table [data-add-video="101"]').click();
  await (await chooser).setFiles(long);
  await page.waitForTimeout(1500);
  check(!(await page.evaluate(() => window.FAKE.ops.some(o => o[0] === 'upload'))) && /30 seconds or less/.test(await toast()), 'a 40-second video is refused');

  // With a video: Play and Replace.
  const withVideo = member + `F.tables.clock_videos=[{clock_event_id:101,member_id:7,club_id:1,storage_path:'1/7/101/1.webm',duration_seconds:3}];`;
  await open('/repo/pages/member/history/page.js', withVideo, { viewport: { width: 390, height: 800 } });
  const card = page.locator('.public-card').first();
  check(await card.locator('[data-play-video="101"]').isVisible() && await card.locator('[data-add-video="101"]').isVisible(), 'phone card: Play video and Replace');
  await page.screenshot({ path: `${OUT}/member-history-video-phone.png` });

  // Receipt right after clocking: Add a short video.
  await open('/repo/pages/member/clocking/page.js', member + `F.rpc.submit_member_clock={status:'accepted',message:'Clocked.',receipt_id:102,pigeon_ring:'PH-2',race:'Batangas Derby',received_at_utc:'2026-11-24 03:00:00'};`);
  const hasReceipt = await page.locator('[data-receipt-video]').count();
  check(hasReceipt === 1, 'the receipt has an Add a short video button');

  // Admin: Show up lists the video and plays it in a dialog.
  await open('/repo/pages/admin/showup/page.js', withVideo);
  const play = page.locator('[data-showup-table] [data-play-video="101"]');
  check(await play.count() === 1 && (await page.locator('[data-showup-table] [data-play-video]').count()) === 1, 'Show up: Play only where a video was added');
  await page.locator('[data-showup-table]').screenshot({ path: `${OUT}/showup-video-column.png` });
  await play.click(); await page.waitForTimeout(300);
  const dlg = page.locator('dialog.clock-video-dialog[open]');
  check(await dlg.count() === 1 && await dlg.getAttribute('closedby') === 'any' && /PH-1/.test(await dlg.innerText()) && /^blob:1\/7\/101\/1\.webm$/.test(await dlg.locator('video').getAttribute('src')), 'plays it in a dialog (signed link)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await page.locator('dialog.clock-video-dialog[open]').count() === 0, 'Esc closes it');
};
