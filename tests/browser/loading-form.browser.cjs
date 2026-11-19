// AvilonX loading form: print it, fill some boxes, photograph it at different
// angles, and read it back (corner squares, rows, remark ticks).
module.exports = async (page, { open, check, OUT }) => {
  await open('/repo/assets/js/i18n.js', '', { fn: 'getLang' });
  const result = await page.evaluate(async () => {
    const form = await import('/repo/pages/admin/entries/loading-form.js');
    const reader = await import('/repo/pages/admin/entries/sheet-reader.js');
    // Print the form into an iframe, then "photograph" it onto a canvas.
    const html = form.loadingFormHtml({ clubName: 'Test Club', race: { name: 'Batangas Derby', release_location: 'Batangas' }, remarks: ['P1', 'P2', 'P3', 'OCP'], paper: 'long' });
    const pxPerMm = 4, P = form.PAPERS.long, W = Math.round(P.width * pxPerMm), H = Math.round(P.height * pxPerMm), M = 11 * pxPerMm, FW = W - 2 * M, FH = H - 2 * M;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const c = canvas.getContext('2d');
    c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, W, H);
    const L = form.FORM_LAYOUT, X = f => M + f * FW, Y = f => M + f * FH;
    const sq = (fx, fy, mm) => { c.fillStyle = '#111'; c.fillRect(X(fx) - mm * pxPerMm / 2, Y(fy) - mm * pxPerMm / 2, mm * pxPerMm, mm * pxPerMm); };
    sq(0, 0, L.marks.big); sq(1, 0, L.marks.small); sq(1, 1, L.marks.small); sq(0, 1, L.marks.small);
    c.strokeStyle = '#222'; c.lineWidth = 1.5; c.strokeRect(X(L.table.left), Y(L.table.top), X(L.table.right) - X(L.table.left), Y(L.table.bottom) - Y(L.table.top));
    // Fill rows 1 and 3 in, like a member would.
    const write = (box, ch) => { c.fillStyle = '#1a2a6c'; c.font = `bold ${Math.round((Y(box.y1) - Y(box.y0)) * .8)}px Arial`; c.fillText(ch, X(box.x0) + (X(box.x1) - X(box.x0)) * .22, Y(box.y1) - (Y(box.y1) - Y(box.y0)) * .18); };
    const tick = box => { c.strokeStyle = '#1a2a6c'; c.lineWidth = 3; c.beginPath(); c.moveTo(X(box.x0) + 2, Y(box.y0) + 2); c.lineTo(X(box.x1) - 2, Y(box.y1) - 2); c.moveTo(X(box.x1) - 2, Y(box.y0) + 2); c.lineTo(X(box.x0) + 2, Y(box.y1) - 2); c.stroke(); };
    for (let r = 0; r < L.rows; r++) { const b = form.rowBoxes(r); c.strokeStyle = '#666'; c.lineWidth = 1; [...b.member, ...b.prefix, ...b.number, ...b.remarks].forEach(x => c.strokeRect(X(x.x0), Y(x.y0), X(x.x1) - X(x.x0), Y(x.y1) - Y(x.y0))); }
    const r0 = form.rowBoxes(0), r2 = form.rowBoxes(2);
    '161'.split('').forEach((ch, i) => write(r0.member[i], ch)); 'MCHPFC'.split('').forEach((ch, i) => write(r0.prefix[i], ch)); '0088'.split('').forEach((ch, i) => write(r0.number[i], ch)); tick(r0.remarks[1]);
    '252'.split('').forEach((ch, i) => write(r2.member[i], ch)); 'JAPAN'.split('').forEach((ch, i) => write(r2.prefix[i], ch)); '516372'.split('').forEach((ch, i) => write(r2.number[i], ch)); tick(r2.remarks[0]); tick(r2.remarks[1]);
    window.__formImage = canvas.toDataURL('image/png');
    const results = {};
    for (const angle of [0, 90, 180, 270]) {
      const photo = reader.rotateDocumentCanvas(canvas, angle);
      const marks = reader.findFormMarks(photo);
      if (!marks) { results[angle] = null; continue; }
      const read = reader.readFormLayout(photo, marks, L, form.rowBoxes, ['P1', 'P2', 'P3', 'OCP']);
      results[angle] = read.rows.map(row => ({ row: row.sheetRow, remarks: row.remarks_text, member: row.memberBoxes.length, prefix: row.prefixBoxes.length, number: row.numberBoxes.length }));
    }
    // A photo without corner squares is not taken for an AvilonX form.
    const plain = document.createElement('canvas'); plain.width = 600; plain.height = 900; plain.getContext('2d').fillStyle = '#fff'; plain.getContext('2d').fillRect(0, 0, 600, 900);
    return { results, plain: reader.findFormMarks(plain), htmlHasMarks: (html.match(/class="mark"/g) || []).length };
  });
  require('fs').writeFileSync(`${OUT}/loading-form-filled.png`, Buffer.from((await page.evaluate(() => window.__formImage)).split(',')[1], 'base64'));
  check(result.htmlHasMarks === 4, 'the printed form has 4 corner squares');
  check(result.plain === null, 'a page without corner squares is not an AvilonX form');
  for (const angle of ['0', '90', '180', '270']) {
    const rows = result.results[angle];
    check(Array.isArray(rows), `found at ${angle}°`);
    if (!rows) continue;
    check(rows.length === 2 && rows[0].row === '1' && rows[1].row === '3', `${angle}°: rows 1 and 3 filled in (${JSON.stringify(rows.map(r => r.row))})`);
    check(rows[0]?.remarks === 'P2' && rows[1]?.remarks === 'P1/P2', `${angle}°: remark ticks read (${rows.map(r => r.remarks).join(' | ')})`);
    check(rows[0]?.member === 3 && rows[0]?.prefix === 6 && rows[0]?.number === 4, `${angle}°: written boxes found (${JSON.stringify(rows[0])})`);
  }
};
