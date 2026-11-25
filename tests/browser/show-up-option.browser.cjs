// Race schedules: "Show up needed" checkbox. Unticked, clocked pigeons never wait or get disqualified.
module.exports = async (page, { open, check, sample, toast, OUT }) => {
  await open('/repo/pages/admin/races/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];`);
  await page.click('[data-race-row="5"]');
  check(await page.locator('[name=requires_show_up]').isChecked(), 'ticked by default');
  await page.locator('.schedule-showup').scrollIntoViewIfNeeded();
  await page.locator('[data-schedule-editor]').screenshot({ path: `${OUT}/race-showup-option.png` });
  await page.uncheck('[name=requires_show_up]');
  await page.click('[data-save-schedule]'); await page.waitForTimeout(400);
  const saved = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'update' && o[1] === 'races').at(-1)?.[2]);
  check(saved && saved.requires_show_up === false, `saves Show up needed unticked (${JSON.stringify(saved)})`);
  await open('/repo/pages/admin/races/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];F.tables.races[0].requires_show_up=false;`);
  check(/No show up/.test(await page.locator('[data-race-row="5"]').innerText()), 'the schedule list shows it');
  await page.click('[data-race-row="5"]');
  check(!(await page.locator('[name=requires_show_up]').isChecked()), 'and the form opens unticked');

  // Ticked races don't send the field (works before the SQL update).
  await open('/repo/pages/admin/races/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',latitude:13,longitude:121}];`);
  await page.click('[data-race-row="5"]'); await page.click('[data-save-schedule]'); await page.waitForTimeout(400);
  const plain = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'update' && o[1] === 'races').at(-1)?.[2]);
  check(plain && !('requires_show_up' in plain), 'ticked: field not sent');

  // Closed race without show-up: the bird that never showed up is not DQ, and is ranked.
  const noShow = sample + `F.tables.races[0].status='closed';F.tables.races[0].requires_show_up=false;`;
  await open('/repo/pages/admin/showup/page.js', noShow);
  const table = await page.locator('[data-showup-table]').innerText();
  check(/No show up needed/.test(table) && !/Disqualified/.test(table), 'Show up page: "No show up needed", not disqualified');
  await open('/repo/pages/admin/results/page.js', noShow);
  const ana = (await page.locator('#results-table tbody tr').allInnerTexts()).find(t => /PH-2/.test(t)) || '';
  check(/#\d/.test(ana) && /No show up needed/.test(ana), `results: ranked, "No show up needed" (${ana.replace(/\s+/g, ' ')})`);
  await open('/repo/pages/admin/results/page.js', sample + `F.tables.races[0].status='closed';`);
  const dq = (await page.locator('#results-table tbody tr').allInnerTexts()).find(t => /PH-2/.test(t)) || '';
  check(/Disqualified/.test(dq) && !/#\d/.test(dq), 'with show-up needed: still disqualified');
};
