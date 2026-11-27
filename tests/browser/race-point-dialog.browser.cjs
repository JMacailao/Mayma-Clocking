// Race points: the add / edit form is hidden and opens in a pop-up (Add race
// point, or Edit on a saved location); Esc, Cancel and × close it.
module.exports = async (page, { open, check, sample, OUT }) => {
  await open('/repo/pages/admin/race-points/page.js', sample + `F.tables.race_points=[{id:1,location:'Batangas',sector:'South',description:null,latitude:13.75,longitude:121.05}];`);
  const dialog = page.locator('[data-race-point-dialog]');
  check(!(await dialog.isVisible()) && await page.locator('[data-table] tbody tr').count() === 1, 'form hidden; the saved locations list shows');
  await page.click('[data-add-race-point]');
  check(await dialog.isVisible() && await dialog.evaluate(d => d.matches(':modal')) && await page.locator('#race-point-dialog-title').innerText() === 'Add a race point', 'Add race point opens the pop-up');
  check(await page.evaluate(() => document.activeElement?.name) === 'location', 'the Location field is ready to type');
  await page.screenshot({ path: `${OUT}/race-point-add-dialog.png` });
  await page.keyboard.press('Escape');
  check(!(await dialog.isVisible()), 'Esc closes it');
  await page.click('[data-edit]');
  check(await dialog.isVisible() && await page.locator('#race-point-dialog-title').innerText() === 'Edit race point' && await page.inputValue('#record-form [name=location]') === 'Batangas', 'Edit opens it with the saved location');
  await page.click('#cancel-edit');
  check(!(await dialog.isVisible()), 'Cancel closes it');
  await page.click('[data-edit]'); await page.click('[data-close-race-point]');
  check(!(await dialog.isVisible()), '× closes it');
  await page.click('[data-add-race-point]');
  check(await page.inputValue('#record-form [name=location]') === '' && await page.locator('#race-point-dialog-title').innerText() === 'Add a race point', 'after an edit, Add starts empty');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-add-race-point]');
  const box = await dialog.boundingBox();
  check(box && Math.round(box.width) === 390, `phone: the pop-up fills the screen (${box && Math.round(box.width)})`);
  await page.screenshot({ path: `${OUT}/race-point-add-dialog-390.png` });
};
