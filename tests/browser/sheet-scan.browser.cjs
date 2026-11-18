// Scan race sheet: the loading form's table is found in a real photo.
module.exports = async (page, { open, check, FIXTURES }) => {
  await open('/repo/assets/js/i18n.js', '', { fn: 'getLang' });
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'f'; document.body.append(input); });
  await page.setInputFiles('#f', `${FIXTURES}/loading-form.webp`);
  const result = await page.evaluate(async () => {
    const m = await import('/repo/pages/admin/entries/sheet-reader.js');
    const photo = await m.documentFileToCanvas(document.querySelector('#f').files[0]);
    const sideways = m.detectTableGrid(photo), upright = m.rotateDocumentCanvas(photo, 90), grid = m.detectTableGrid(upright);
    const rows = grid ? m.entrySheetRowsFromGrid(grid, upright) : [];
    return { sideways: Boolean(sideways), rows: rows.length, first: rows[0] && ['memberRegion', 'ringRegion', 'remarksRegion', 'barcodeRegion'].map(k => Math.round(rows[0][k].left)), width: upright.width };
  });
  check(!result.sideways, 'a sideways photo is not taken for the table');
  check(result.rows === 15, `finds the 15 rows (found ${result.rows})`);
  if (result.first) {
    const [member, ring, remarks, sticker] = result.first.map(x => x / result.width);
    check(member > .13 && member < .18 && ring > .38 && ring < .43 && remarks > .55 && remarks < .6 && sticker > .7 && sticker < .75, `columns in the right place (${result.first.join(', ')})`);
  }
};
