// Scan race sheet review: boxes the reader was not sure about are yellow,
// "Looks right" clears them, and Next / Previous step through the rows that
// still need a look. The page reads a drawn AvilonX loading form (the text
// reader is a stand-in; the boxes are read by AvilonX's own digit reader).
module.exports = async (page, { open, check, sample }) => {
  await page.addInitScript(() => { window.Tesseract = { createWorker: async () => ({ recognize: async () => ({ data: { words: [], text: '', confidence: 0 } }), terminate: async () => {} }) }; });
  await open('/repo/pages/admin/entries/page.js', sample + `F.tables.members.push({id:9,member_no:'161',full_name:'Ben Reyes',loft_name:'Hill Loft'});`, { fn: 'entriesPage' });
  await page.click('[data-entry-tab="sheet"]');
  const png = await page.evaluate(async () => {
    const form = await import('/repo/pages/admin/entries/loading-form.js');
    const L = form.formLayout({}), boxesOf = i => form.rowBoxes(i, L), px = 4, P = form.PAPERS.long, W = Math.round(P.width * px), H = Math.round(P.height * px), M = 11 * px, FW = W - 2 * M, FH = H - 2 * M;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const c = canvas.getContext('2d');
    c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, W, H); const X = f => M + f * FW, Y = f => M + f * FH;
    const sq = (fx, fy, mm) => { c.fillStyle = '#111'; c.fillRect(X(fx) - mm * px / 2, Y(fy) - mm * px / 2, mm * px, mm * px); };
    sq(0, 0, L.marks.big); sq(1, 0, L.marks.small); sq(1, 1, L.marks.small); sq(0, 1, L.marks.small);
    c.strokeStyle = '#222'; c.lineWidth = 1.5; c.strokeRect(X(L.table.left), Y(L.table.top), X(L.table.right) - X(L.table.left), Y(L.table.bottom) - Y(L.table.top));
    const bits = form.formCodeBits({ raceId: 1, layout: L }); form.formCodeCells().forEach((cell, i) => { if (bits[i]) { c.fillStyle = '#111'; c.fillRect(X(cell.x0), Y(cell.y0), X(cell.x1) - X(cell.x0), Y(cell.y1) - Y(cell.y0)); } });
    for (let r = 0; r < L.rows; r++) { const b = boxesOf(r); c.strokeStyle = '#666'; c.lineWidth = 1; [...b.member, ...b.prefix, ...b.number, ...b.remarks].forEach(x => c.strokeRect(X(x.x0), Y(x.y0), X(x.x1) - X(x.x0), Y(x.y1) - Y(x.y0))); }
    const write = (box, ch) => { c.fillStyle = '#1a2a6c'; c.font = `bold ${Math.round((Y(box.y1) - Y(box.y0)) * .8)}px Arial`; c.fillText(ch, X(box.x0) + (X(box.x1) - X(box.x0)) * .22, Y(box.y1) - (Y(box.y1) - Y(box.y0)) * .18); };
    const scribble = box => { c.strokeStyle = '#1a2a6c'; c.lineWidth = 3; c.beginPath(); const x0 = X(box.x0) + 4, x1 = X(box.x1) - 4, y0 = Y(box.y0) + 4, y1 = Y(box.y1) - 4; c.moveTo(x0, y0); c.bezierCurveTo(x1, y0, x0, y1, x1, y1); c.moveTo(x0, (y0 + y1) / 2); c.lineTo(x1, y0 + 3); c.stroke(); };
    const r0 = boxesOf(0), r2 = boxesOf(2), r4 = boxesOf(4);
    '161'.split('').forEach((ch, i) => write(r0.member[i], ch)); '0088'.split('').forEach((ch, i) => write(r0.number[i], ch));
    '252'.split('').forEach((ch, i) => write(r2.member[i], ch)); '5163'.split('').forEach((ch, i) => write(r2.number[i], ch));
    write(r4.member[0], '1'); scribble(r4.member[1]); write(r4.member[2], '1'); '7'.split('').forEach((ch, i) => write(r4.number[i], ch));
    return canvas.toDataURL('image/png');
  });
  await page.setInputFiles('[data-sheet-file]', { name: 'form.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  await page.waitForFunction(() => !document.querySelector('[data-read-sheet]').disabled);
  await page.click('[data-read-sheet]');
  await page.waitForFunction(() => /to check|All rows checked/.test(document.querySelector('[data-sheet-nav-count]')?.textContent || ''), null, { timeout: 30000 });
  const state = () => page.evaluate(() => ({
    count: document.querySelector('[data-sheet-nav-count]').textContent,
    rows: [...document.querySelectorAll('[data-sheet-row]')].map(tr => ({ id: tr.dataset.sheetRow, unsure: [...tr.querySelectorAll('.entry-sheet-input.is-unsure')].map(i => i.dataset.sheetField), current: tr.classList.contains('is-current'), ok: !tr.querySelector('[data-sheet-ok]').hidden, error: tr.classList.contains('has-errors') })),
    focused: document.activeElement?.dataset?.sheetField || ''
  }));
  let s = await state();
  check(s.rows.length === 3, `three rows read (${s.rows.length})`);
  check(s.rows[2]?.unsure.includes('member_no') && s.rows[2]?.ok, `the scribbled member ID is yellow, with "Looks right" (${JSON.stringify(s.rows[2])})`);
  const toCheck = s.rows.filter(r => r.error || r.unsure.length).length;
  check(s.count === `${toCheck} row${toCheck === 1 ? '' : 's'} to check` && toCheck >= 1, `count of rows to check (${s.count})`);
  // Next goes to the first row to check, then the next one; Previous goes back.
  await page.click('[data-sheet-next]'); s = await state();
  const first = s.rows.findIndex(r => r.error || r.unsure.length);
  check(s.rows[first]?.current, `Next: first row to check is marked (${JSON.stringify(s.rows.map(r => r.current))})`);
  if (toCheck > 1) { await page.click('[data-sheet-next]'); const after = await state(); check(after.rows.findIndex(r => r.current) > first, 'Next: moves on'); await page.click('[data-sheet-prev]'); check((await state()).rows.findIndex(r => r.current) === first, 'Previous: back'); }
  // "Looks right" clears the yellow box of that row.
  await page.locator('[data-sheet-row]').nth(2).locator('[data-sheet-ok]').click(); s = await state();
  check(!s.rows[2].unsure.length && !s.rows[2].ok, `Looks right clears the yellow boxes (${JSON.stringify(s.rows[2])})`);
  // Typing in a yellow box also counts as checked.
  const unsureRow = s.rows.findIndex(r => r.unsure.length);
  // The loading form's QR text (club, race, page).
  const qr = await page.evaluate(async () => { const f = await import('/repo/pages/admin/entries/loading-form.js'); return [f.formQrText({ clubId: 7, raceId: 6, page: 2 }), f.parseFormQr('AVX-LF:7:6:2'), f.parseFormQr('https://example.com'), f.loadingFormHtml({ race: { id: 6, name: 'Derby', lap: 3 }, copies: 2, qrSvgs: ['<svg></svg>', '<svg></svg>'] })]; });
  check(qr[0] === 'AVX-LF:7:6:2' && JSON.stringify(qr[1]) === '{"clubId":7,"raceId":6,"page":2}' && qr[2] === null, `QR text ${JSON.stringify(qr.slice(0, 3))}`);
  check((qr[3].match(/class="qr"/g) || []).length === 2 && /PAGE 2 OF 2/.test(qr[3]) && /3 · Derby/.test(qr[3]), 'printed form: a QR and page number on each page, lap shown');
  if (unsureRow >= 0) { const field = s.rows[unsureRow].unsure[0]; await page.locator('[data-sheet-row]').nth(unsureRow).locator(`[data-sheet-field="${field}"]`).fill('9'); check(!(await state()).rows[unsureRow].unsure.includes(field), 'editing clears the yellow box'); }
};
