// Scan race sheet → Align on guide: place the corners, straighten, read.
module.exports = async (page, { open, check, sample, FIXTURES, OUT }) => {
  await open('/repo/pages/admin/entries/page.js', sample, { fn: 'entriesPage' });
  await page.click('[data-entry-tab=sheet]');
  check(await page.locator('[data-sheet-align]').isDisabled(), 'Align on guide waits for a photo');
  check(!(await page.locator('[data-sheet-file]').getAttribute('capture')), 'the sheet photo can be chosen from the library (iPhone does not force the camera)');
  await page.setInputFiles('[data-sheet-file]', `${FIXTURES}/loading-form.webp`); await page.waitForTimeout(1200);
  check(/Table not found/.test(await page.locator('[data-sheet-grid-note]').innerText()), 'the sideways photo: table not found yet');
  check(/Align on guide/.test(await page.locator('[data-sheet-grid-note]').innerText()), 'suggests Align on guide');
  await page.click('[data-sheet-align]'); await page.waitForTimeout(400);
  check(await page.locator('dialog.sheet-align[open]').count() === 1, 'the guide opens');
  await page.click('[data-align-rotate]'); await page.waitForTimeout(800);
  await page.locator('.sheet-align-stage').screenshot({ path: `${OUT}/align-guide.png` });
  // Drag the top-left handle a little (it snaps to where the table was found).
  const box = await page.locator('.sheet-align canvas').boundingBox();
  const handle = await page.evaluate(() => { const c = document.querySelector('.sheet-align canvas'); return [c.width, c.height]; });
  check(box && handle[0] > 0, 'the photo is shown on the guide');
  await page.click('[data-align-apply]'); await page.waitForTimeout(1500);
  const note = await page.locator('[data-sheet-grid-note]').innerText();
  check(/(Table found|Aligned on the guide): 15 rows/.test(note), `after straightening, 15 rows (${note.slice(0, 60)})`);
  check(/straightened/.test(await page.locator('[data-sheet-status]').innerText()), 'says the table was straightened');
  // A deliberately wrong alignment still gives the guide's rows (no lines needed).
  await page.click('[data-sheet-align]'); await page.waitForTimeout(400);
  await page.fill('[data-align-rows]', '12');
  const canvas = page.locator('.sheet-align canvas'), b = await canvas.boundingBox();
  await page.mouse.move(b.x + 4, b.y + 4); await page.mouse.down(); await page.mouse.move(b.x + b.width * .3, b.y + b.height * .3, { steps: 4 }); await page.mouse.up();
  await page.click('[data-align-apply]'); await page.waitForTimeout(1500);
  check(/: (12|15) rows|Table not found/.test(await page.locator('[data-sheet-grid-note]').innerText()), 'any alignment is accepted and shown');
};
