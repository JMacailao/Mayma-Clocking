// Race points: changing a point's coordinates warns that its races and their
// entries (clocked birds included) will be recalculated, then saves.
module.exports = async (page, { open, check, sample, toast }) => {
  await open('/repo/pages/admin/race-points/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',sector:'South',description:null,latitude:13,longitude:121}];F.tables.races[0].race_point_id=1;`);
  await page.click('[data-edit]');
  await page.click('[data-coord-mode-button="dd"]');
  await page.fill('[data-coordinate-decimal-for="latitude"]', '13.7565');
  await page.locator('[data-coordinate-decimal-for="latitude"]').dispatchEvent('input');
  await page.fill('[data-coordinate-decimal-for="longitude"]', '121.0583');
  await page.locator('[data-coordinate-decimal-for="longitude"]').dispatchEvent('input');
  let warning = '';
  page.once('dialog', d => { warning = d.message(); d.accept().catch(() => {}); });
  await page.click('#record-form [type=submit]');
  await page.waitForTimeout(500);
  const entries = await page.evaluate(() => window.FAKE.tables.race_entries.filter(e => e.race_id === 5).length);
  check(/used by 1 race /.test(warning) && /Batangas Derby/.test(warning) && new RegExp(`${entries} entr`).test(warning) && /clocked birds included/.test(warning), `warns which races and how many entries are recalculated (${JSON.stringify(warning.slice(0, 160))})`);
  const update = await page.evaluate(() => window.FAKE.ops.filter(o => o[0] === 'update' && o[1] === 'race_points').at(-1)?.[2]);
  check(update && Math.abs(update.latitude - 13.7565) < 1e-6 && Math.abs(update.longitude - 121.0583) < 1e-6, `saves the new coordinates (${JSON.stringify(update)})`);
  check(/recalculated for \d+ entr/.test(await toast()), 'confirms the recalculation');

  // Cancelling keeps the point as it was; a change of description only asks nothing.
  await open('/repo/pages/admin/race-points/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',sector:'South',description:null,latitude:13,longitude:121}];Object.assign(F.tables.races[0],{release_latitude:13,release_longitude:121});`);
  await page.click('[data-edit]');
  await page.fill('#record-form [name=location]', 'Batangas City');
  page.once('dialog', d => d.dismiss().catch(() => {}));
  await page.click('#record-form [type=submit]'); await page.waitForTimeout(400);
  check(!(await page.evaluate(() => window.FAKE.ops.some(o => o[0] === 'update' && o[1] === 'race_points'))), 'cancel: nothing saved');
  await page.fill('#record-form [name=location]', 'Batangas'); await page.fill('#record-form [name=description]', 'Port area');
  let asked = false; page.once('dialog', d => { asked = true; d.accept().catch(() => {}); });
  await page.click('#record-form [type=submit]'); await page.waitForTimeout(400);
  check(!asked && (await page.evaluate(() => window.FAKE.ops.some(o => o[0] === 'update' && o[1] === 'race_points'))), 'description only: saved without asking');

  // Another point with the same name: unlinked races may be the other point's, so they are not counted.
  await open('/repo/pages/admin/race-points/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',sector:'South',description:null,latitude:13,longitude:121},{id:2,location:'Batangas',sector:'North',description:null,latitude:14,longitude:121}];F.tables.races.forEach(r=>{r.race_point_id=null;});`);
  await page.locator('[data-edit]').last().click();
  await page.fill('#record-form [name=location]', 'Batangas Port');
  asked = false; page.once('dialog', d => { asked = true; d.accept().catch(() => {}); });
  await page.click('#record-form [type=submit]'); await page.waitForTimeout(400);
  check(!asked, 'same-named point: unlinked races are not claimed');

  // The races cannot be checked: nothing is saved and the admin is told.
  await open('/repo/pages/admin/race-points/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',sector:'South',description:null,latitude:13,longitude:121}];F.tables.races[0].race_point_id=1;`);
  await page.evaluate(() => { window.FAKE.fail = { races: 'offline' }; });
  await page.click('[data-edit]');
  await page.fill('#record-form [name=location]', 'Batangas City');
  asked = false; page.once('dialog', d => { asked = true; d.accept().catch(() => {}); });
  await page.click('#record-form [type=submit]'); await page.waitForTimeout(400);
  check(!asked && !(await page.evaluate(() => window.FAKE.ops.some(o => o[0] === 'update' && o[1] === 'race_points'))) && /nothing was saved/.test(await toast()), 'races lookup fails: nothing saved, admin told');
};
