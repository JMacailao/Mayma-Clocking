// Race entries → Print basketing sheet: every entry of a race, one block per
// member, with a tick box per bird for basketing night. The QR code opens the
// race's public results, so members can scan it to follow the race.
import { escapeHTML as esc } from '../../../assets/js/shared.js';

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: QR_LIB, crossOrigin: 'anonymous' });
    script.onload = () => window.qrcode ? resolve(window.qrcode) : reject(new Error('The QR code maker could not start.'));
    script.onerror = () => reject(new Error('The QR code maker could not be loaded. Check the internet connection.'));
    document.head.append(script);
  });
}

export const resultsLink = (clubId, race, site = 'https://www.avilonx.site') => {
  const date = race.release_at_utc ? new Date(`${String(race.release_at_utc).replace(' ', 'T')}Z`).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : '';
  return `${site}/pages/login/index.html?results=${clubId}&date=${date}`;
};

export function basketingSheetHtml({ clubName, race, entries, members, birds = [], qrSvg = '', link = '' }) {
  const memberById = new Map(members.map(m => [m.id, m])), birdById = new Map(birds.map(b => [b.id, b]));
  const groups = new Map();
  entries.filter(e => e.race_id === race.id).forEach(e => { const list = groups.get(e.member_id) || []; list.push(e); groups.set(e.member_id, list); });
  const sorted = [...groups.entries()].sort(([a], [b]) => String(memberById.get(a)?.member_no ?? '').localeCompare(String(memberById.get(b)?.member_no ?? ''), undefined, { numeric: true }));
  const total = [...groups.values()].reduce((n, list) => n + list.length, 0);
  const release = race.release_at_utc ? new Date(`${String(race.release_at_utc).replace(' ', 'T')}Z`).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : 'not set';
  const blocks = sorted.map(([memberId, list]) => {
    const m = memberById.get(memberId) || {};
    return `<section class="member"><h2>${esc(m.member_no || '—')} · ${esc(m.full_name || 'Member')} <small>${esc(m.loft_name || '')} · ${list.length} bird${list.length === 1 ? '' : 's'}</small></h2>
      <table><thead><tr><th class="n">#</th><th>Ring</th><th>Bird</th><th>Remarks</th><th>RFID tag</th><th>Sticker</th><th class="tick">Basketed</th><th class="sign">Member's signature</th></tr></thead><tbody>
      ${list.sort((a, b) => String(a.pigeon_ring).localeCompare(String(b.pigeon_ring), undefined, { numeric: true })).map((e, i) => { const b = birdById.get(e.pigeon_id) || {}; return `<tr><td class="n">${i + 1}</td><td><strong>${esc(e.pigeon_ring || '—')}</strong></td><td>${esc([b.bird_name, b.color].filter(Boolean).join(' · ') || '—')}</td><td>${esc((e.remarks || []).join(', ') || '—')}</td><td class="mono">${esc(e.nfc_tag || '—')}</td><td>${e.barcode ? '✓ given' : '—'}</td><td class="tick"><span class="box"></span></td><td class="sign"></td></tr>`; }).join('')}
      </tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Basketing sheet · ${esc(race.name)}</title><style>
  @page{size:A4;margin:12mm}
  body{font:11pt/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111;margin:0}
  header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid #00345f;padding-bottom:8px;margin-bottom:10px}
  header h1{font-size:18pt;margin:0 0 4px;color:#00345f}header p{margin:0;color:#444;font-size:10pt}
  .qr{text-align:center;font-size:8pt;color:#444}.qr svg{width:28mm;height:28mm;display:block}
  .member{break-inside:avoid;margin:0 0 10px}
  h2{font-size:12pt;margin:8px 0 4px}h2 small{font-weight:400;color:#555;font-size:9.5pt}
  table{width:100%;border-collapse:collapse;font-size:9.5pt}
  th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eef2f6;font-size:8.5pt;text-transform:uppercase}
  .n{width:6mm;text-align:center}.tick{width:18mm;text-align:center}.sign{width:40mm}.mono{font-family:ui-monospace,monospace;font-size:8.5pt}
  .box{display:inline-block;width:4.5mm;height:4.5mm;border:1.5px solid #111}
  footer{margin-top:12px;display:flex;justify-content:space-between;font-size:9pt;color:#444}footer span{border-top:1px solid #111;padding-top:2px;min-width:60mm}
  @media screen{body{max-width:190mm;margin:8mm auto;padding:10mm;background:#fff;box-shadow:0 2px 12px #0003}html{background:#e9edf2}}
  </style></head><body>
  <header><div><h1>Basketing sheet · ${esc(race.name)}</h1><p>${esc(clubName || '')}</p><p>Release point: ${esc(race.release_location || '—')} · Release: ${esc(release)}</p><p><strong>${groups.size}</strong> member${groups.size === 1 ? '' : 's'} · <strong>${total}</strong> bird${total === 1 ? '' : 's'} entered</p></div>
  ${qrSvg ? `<div class="qr">${qrSvg}Scan for live results<br>www.avilonx.site</div>` : ''}</header>
  ${blocks || '<p>No entries for this race yet.</p>'}
  <footer><span>Basketed by</span><span>Checked by</span><span>Date and time</span></footer>
  </body></html>`;
}

export async function printBasketingSheet({ clubId, ...options }) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('The browser blocked the new window. Allow pop-ups for AvilonX, then try again.');
  const link = resultsLink(clubId, options.race);
  let qrSvg = '';
  try { const qrcode = await loadQr(); const qr = qrcode(0, 'M'); qr.addData(link); qr.make(); qrSvg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (error) { console.warn(error); }
  win.document.open(); win.document.write(basketingSheetHtml({ ...options, qrSvg, link })); win.document.close();
  setTimeout(() => win.print(), 400);
  return win;
}
