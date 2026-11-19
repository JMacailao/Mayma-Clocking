// Accuracy check for the AvilonX loading form reader, on real photos.
//
//   node tools/form-accuracy/run.mjs [folder] [--min 0.9]
//
// The folder (default tests/forms) holds photos (name.jpg / name.png) with an
// answer file each (name.json):
//   { "settings": { "memberBoxes": 5, "prefixBoxes": 0, "numberBoxes": 8, "remarks": ["P1"] },
//     "members": ["11001", "252"],                       (optional: registered member IDs)
//     "rings": { "11001": ["11235461"] },                 (optional: bonded rings per member)
//     "rows": [ { "row": "1", "member": "11001", "ring": "11235461", "remarks": "P1" } ] }
// It reads each photo the way Race entries does (corner squares, form code,
// boxes, digit reader, matching) and prints how many fields came out right,
// as read and after matching. Ring letters need Tesseract and are not read here.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2), minAt = args.indexOf('--min'), min = minAt >= 0 ? Number(args[minAt + 1]) : null;
const folder = path.resolve(args.find((a, i) => !a.startsWith('--') && (minAt < 0 || i !== minAt + 1)) || path.join(ROOT, 'tests', 'forms'));
const photos = fs.existsSync(folder) ? fs.readdirSync(folder).filter(f => /\.(jpe?g|png)$/i.test(f) && fs.existsSync(path.join(folder, f.replace(/\.\w+$/, '.json')))) : [];
if (!photos.length) { console.log(`No photos with answer files in ${folder}. See tools/form-accuracy/README.md.`); process.exit(0); }

const types = { '.js': 'text/javascript', '.html': 'text/html', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url.startsWith('/photos/') ? path.join(folder, path.basename(url)) : path.join(ROOT, path.normalize(url));
  if (!file.startsWith(ROOT) && !file.startsWith(folder)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, data) => { if (error) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' }); res.end(data); });
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch(), page = await browser.newPage();
await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: 'export const createClient=()=>({});export default {};' }));
await page.goto(`http://localhost:${port}/index.html`).catch(() => {});

const norm = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
const total = { rows: 0, found: 0, extra: 0, member: [0, 0], ring: [0, 0], remarks: 0, fields: 0 };
for (const photo of photos) {
  const answer = JSON.parse(fs.readFileSync(path.join(folder, photo.replace(/\.\w+$/, '.json')), 'utf8'));
  const read = await page.evaluate(async ({ src, answer }) => {
    const reader = await import('/pages/admin/entries/sheet-reader.js'), form = await import('/pages/admin/entries/loading-form.js'), match = await import('/pages/admin/entries/form-match.js');
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d').drawImage(image, 0, 0);
    const marks = reader.findFormMarks(canvas); if (!marks) return { error: 'corner squares not found' };
    const guess = form.formLayout(answer.settings), oriented = reader.orientForm(canvas, marks, { layout: guess, boxesOf: i => form.rowBoxes(i, guess), codeCells: form.formCodeCells(), decode: form.readFormCodeBits }), code = oriented.code;
    const settings = code ? { ...answer.settings, memberBoxes: code.memberBoxes, prefixBoxes: code.prefixBoxes, numberBoxes: code.numberBoxes } : answer.settings;
    const layout = form.formLayout(settings), result = reader.readFormLayout(canvas, oriented.corners, layout, i => form.rowBoxes(i, layout), oriented.page);
    await reader.readFormHandwriting(null, result.page, result.rows, () => {}, result.inkPage);
    const raw = result.rows.map(r => ({ row: r.sheetRow, member: r.member_no, ring: r.pigeon_ring, remarks: r.remarks_text }));
    const members = (answer.members || []).map((no, i) => ({ id: i + 1, member_no: no }));
    const birds = answer.rings ? Object.entries(answer.rings).flatMap(([no, rings], k) => { const m = members.find(x => x.member_no === no); return m ? rings.map((ring, j) => ({ id: k * 100 + j + 1, member_id: m.id, ring_number: ring, status: 'active' })) : []; }) : null;
    match.matchFormRows(result.rows, members, birds);
    return { code: Boolean(code), sharp: reader.formSharpness(oriented.page), rows: result.rows.map((r, i) => ({ ...raw[i], matchedMember: r.member_no, matchedRing: r.pigeon_ring })) };
  }, { src: `/photos/${encodeURIComponent(photo)}`, answer });
  if (read.error) { console.log(`✕ ${photo}: ${read.error}`); total.rows += answer.rows.length; continue; }
  const lines = [];
  for (const want of answer.rows) {
    total.rows++; const got = read.rows.find(r => r.row === String(want.row));
    if (!got) { lines.push(`  row ${want.row}: not found`); continue; }
    total.found++;
    const m = [norm(got.member) === norm(want.member), norm(got.matchedMember) === norm(want.member)], r = [norm(got.ring) === norm(want.ring), norm(got.matchedRing) === norm(want.ring)], k = norm(got.remarks) === norm(want.remarks);
    total.member[0] += m[0]; total.member[1] += m[1]; total.ring[0] += r[0]; total.ring[1] += r[1]; total.remarks += k;
    if (!m[0] || !r[0] || !m[1] || !r[1] || !k) lines.push(`  row ${want.row}: member ${got.member}→${got.matchedMember} (want ${want.member}) · ring ${got.ring}→${got.matchedRing} (want ${want.ring}) · remarks "${got.remarks}" (want "${want.remarks || ''}")`);
  }
  const extra = read.rows.filter(r => !answer.rows.some(w => String(w.row) === r.row)); total.extra += extra.length;
  extra.forEach(r => lines.push(`  row ${r.row}: read but empty on the answer sheet`));
  console.log(`${lines.length ? '•' : '✓'} ${photo}${read.code ? ' (form code read)' : ''}${read.sharp < .1 ? ' (blurry photo: AvilonX warns)' : ''}`); lines.forEach(l => console.log(l));
}
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '—';
console.log(`\nRows found: ${total.found}/${total.rows}, extra rows: ${total.extra}`);
console.log(`Member ID: ${pct(total.member[0], total.rows)} as read, ${pct(total.member[1], total.rows)} after matching`);
console.log(`Ring:      ${pct(total.ring[0], total.rows)} as read, ${pct(total.ring[1], total.rows)} after matching`);
console.log(`Remarks:   ${pct(total.remarks, total.rows)}`);
const score = total.rows ? (total.member[1] + total.ring[1] + total.remarks) / (3 * total.rows + total.extra) : 1;
console.log(`Score:     ${pct(score, 1)}`);
await browser.close(); server.close();
if (min !== null && score < min) { console.log(`Below the minimum ${min}.`); process.exit(1); }
