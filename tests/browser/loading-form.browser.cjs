// AvilonX loading form: print it with the club's settings, fill some boxes,
// photograph it at different angles and read it back (corner squares, rows,
// written boxes, remark ticks).
module.exports = async (page, { open, check, OUT }) => {
  await open('/repo/assets/js/i18n.js', '', { fn: 'getLang' });
  const cases = [
    { name: 'default', settings: { remarks: ['P1', 'P2', 'P3', 'OCP'] }, tick1: [1], tick3: [0, 1], want: { member: 3, prefix: 6, number: 4 } },
    { name: 'club settings', settings: { memberBoxes: 3, prefixBoxes: 4, numberBoxes: 6, remarks: ['P1', 'P2', 'P3', 'OCP', 'VAC', 'LATE', 'PAID'] }, tick1: [4], tick3: [0, 6], want: { member: 3, prefix: 4, number: 4 } }
  ];
  for (const testCase of cases) {
    const result = await page.evaluate(async testCase => {
      const form = await import('/repo/pages/admin/entries/loading-form.js');
      const reader = await import('/repo/pages/admin/entries/sheet-reader.js');
      const layout = form.formLayout(testCase.settings), boxesOf = index => form.rowBoxes(index, layout);
      const html = form.loadingFormHtml({ clubName: 'Test Club', race: { name: 'Batangas Derby' }, layout, paper: 'long' });
      const pxPerMm = 4, P = form.PAPERS.long, W = Math.round(P.width * pxPerMm), H = Math.round(P.height * pxPerMm), M = 11 * pxPerMm, FW = W - 2 * M, FH = H - 2 * M;
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const c = canvas.getContext('2d');
      c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, W, H);
      const X = f => M + f * FW, Y = f => M + f * FH, L = layout;
      const sq = (fx, fy, mm) => { c.fillStyle = '#111'; c.fillRect(X(fx) - mm * pxPerMm / 2, Y(fy) - mm * pxPerMm / 2, mm * pxPerMm, mm * pxPerMm); };
      sq(0, 0, L.marks.big); sq(1, 0, L.marks.small); sq(1, 1, L.marks.small); sq(0, 1, L.marks.small);
      c.strokeStyle = '#222'; c.lineWidth = 1.5; c.strokeRect(X(L.table.left), Y(L.table.top), X(L.table.right) - X(L.table.left), Y(L.table.bottom) - Y(L.table.top));
      const write = (box, ch) => { c.fillStyle = '#1a2a6c'; c.font = `bold ${Math.round((Y(box.y1) - Y(box.y0)) * .8)}px Arial`; c.fillText(ch, X(box.x0) + (X(box.x1) - X(box.x0)) * .22, Y(box.y1) - (Y(box.y1) - Y(box.y0)) * .18); };
      const tick = box => { c.strokeStyle = '#1a2a6c'; c.lineWidth = 3; c.beginPath(); c.moveTo(X(box.x0) + 2, Y(box.y0) + 2); c.lineTo(X(box.x1) - 2, Y(box.y1) - 2); c.moveTo(X(box.x1) - 2, Y(box.y0) + 2); c.lineTo(X(box.x0) + 2, Y(box.y1) - 2); c.stroke(); };
      for (let r = 0; r < L.rows; r++) { const b = boxesOf(r); c.strokeStyle = '#666'; c.lineWidth = 1; [...b.member, ...b.prefix, ...b.number, ...b.remarks].forEach(x => c.strokeRect(X(x.x0), Y(x.y0), X(x.x1) - X(x.x0), Y(x.y1) - Y(x.y0))); }
      const r0 = boxesOf(0), r2 = boxesOf(2);
      '161'.split('').forEach((ch, i) => write(r0.member[i], ch)); 'MCHPFC'.slice(0, r0.prefix.length).split('').forEach((ch, i) => write(r0.prefix[i], ch)); '0088'.split('').forEach((ch, i) => write(r0.number[i], ch)); testCase.tick1.forEach(i => tick(r0.remarks[i]));
      '252'.split('').forEach((ch, i) => write(r2.member[i], ch)); '516372'.slice(0, r2.number.length).split('').forEach((ch, i) => write(r2.number[i], ch)); testCase.tick3.forEach(i => tick(r2.remarks[i]));
      const results = {};
      for (const angle of [0, 90, 180, 270]) {
        const photo = reader.rotateDocumentCanvas(canvas, angle), marks = reader.findFormMarks(photo);
        if (!marks) { results[angle] = null; continue; }
        results[angle] = reader.readFormLayout(photo, marks, layout, boxesOf).rows.map(row => ({ row: row.sheetRow, remarks: row.remarks_text, member: row.memberBoxes.length, prefix: row.prefixBoxes.length, number: row.numberBoxes.length }));
      }
      const labels = testCase.settings.remarks;
      return { results, marksInHtml: (html.match(/class="mark"/g) || []).length, ticksInHtml: (html.match(/class="tick"/g) || []).length, want1: testCase.tick1.map(i => labels[i]).join('/'), want3: testCase.tick3.map(i => labels[i]).join('/') };
    }, testCase);
    check(result.marksInHtml === 4, `${testCase.name}: 4 corner squares printed`);
    check(result.ticksInHtml === 15 * testCase.settings.remarks.length, `${testCase.name}: all ${testCase.settings.remarks.length} remarks printed on every row`);
    for (const angle of ['0', '90', '180', '270']) {
      const rows = result.results[angle];
      check(Array.isArray(rows), `${testCase.name}: found at ${angle}°`);
      if (!rows) continue;
      check(rows.length === 2 && rows[0].row === '1' && rows[1].row === '3', `${testCase.name} ${angle}°: rows 1 and 3 (${JSON.stringify(rows.map(r => r.row))})`);
      check(rows[0]?.remarks === result.want1 && rows[1]?.remarks === result.want3, `${testCase.name} ${angle}°: ticks ${rows.map(r => r.remarks).join(' | ')} (want ${result.want1} | ${result.want3})`);
      check(rows[0]?.member === testCase.want.member && rows[0]?.prefix === testCase.want.prefix && rows[0]?.number === testCase.want.number, `${testCase.name} ${angle}°: written boxes ${JSON.stringify(rows[0])}`);
    }
  }
};
