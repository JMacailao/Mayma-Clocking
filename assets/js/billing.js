// Billing helpers shared by the Super Admin and club admin Billing pages:
// Philippine dates, money, and the printable statement / invoice.
import { escapeHTML, formatDate } from './shared.js';

export const phToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const shift = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const dayAfter = iso => shift(iso, 1);
export const thisMonth = () => { const t = phToday(); return [`${t.slice(0, 8)}01`, t]; };
export const lastMonth = () => { const first = `${phToday().slice(0, 8)}01`, end = shift(first, -1); return [`${end.slice(0, 8)}01`, end]; };

export const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dayText = iso => iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
export const period = bill => `${dayText(bill.start_date)} – ${dayText(bill.end_date)}`;
export const statusTag = bill => bill.settled_at ? '<span class="tag verified">Settled</span>' : '<span class="tag rejected">Not settled</span>';

// The date filter row (start, end, This month, Last month).
export function dateFilterHtml(start, end) {
  return `<div class="billing-dates"><label class="field"><span>Start date</span><input type="date" data-bill-start value="${escapeHTML(start)}"></label>
  <label class="field"><span>End date</span><input type="date" data-bill-end value="${escapeHTML(end)}"></label>
  <div class="billing-quick"><button class="button secondary" type="button" data-bill-quick="this">This month</button><button class="button secondary" type="button" data-bill-quick="last">Last month</button></div></div>`;
}
export function bindDateFilter(root, onChange) {
  const start = root.querySelector('[data-bill-start]'), end = root.querySelector('[data-bill-end]');
  const changed = () => { if (start.value && end.value && end.value < start.value) end.value = start.value; onChange(start.value, end.value); };
  start.onchange = changed; end.onchange = changed;
  root.querySelectorAll('[data-bill-quick]').forEach(button => button.onclick = () => { [start.value, end.value] = button.dataset.billQuick === 'last' ? lastMonth() : thisMonth(); changed(); });
  return () => [start.value, end.value];
}

// Printable statement (not settled) or invoice (settled), optionally with the bird list.
export function printBill({ bill, clubName, entries = null }, openedWindow = null) {
  const paid = Boolean(bill.settled_at), title = paid ? `Invoice ${bill.invoice_no}` : 'Billing statement';
  const rows = entries ? entries.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHTML(formatDate(e.encoded_at))}</td><td>${escapeHTML(e.race_name || '')}</td><td>${escapeHTML(e.member_no || '')} ${escapeHTML(e.member_name || '')}</td><td>${escapeHTML(e.pigeon_ring || '')}</td><td>${e.deleted ? 'Deleted (billed)' : ''}</td><td class="r">${money(e.price)}</td></tr>`).join('') : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)} · ${escapeHTML(clubName)}</title><style>
  @page{margin:16mm}*{box-sizing:border-box}body{margin:0;font:13px/1.5 Arial,Helvetica,sans-serif;color:#111}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #00345f;padding-bottom:12px}
  .brand{font-size:22px;font-weight:800;color:#00345f}.small{color:#555;font-size:12px}h1{margin:0;font-size:20px;text-align:right}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 30px;margin:18px 0}.grid b{display:block;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left}th{background:#f1f5f9;font-size:11px;text-transform:uppercase}.r{text-align:right}
  .total td{font-weight:800;font-size:15px;border-top:2px solid #111}
  .stamp{position:relative;display:inline-block;margin-top:18px;padding:6px 18px;border:4px solid ${paid ? '#15803d' : '#b91c1c'};color:${paid ? '#15803d' : '#b91c1c'};font-size:26px;font-weight:900;letter-spacing:.12em;transform:rotate(-4deg)}
  .note{margin-top:22px;color:#555;font-size:12px}h2{font-size:14px;margin:26px 0 4px}
  </style></head><body>
  <div class="head"><div><div class="brand">AvilonX</div><div class="small">Pigeon race clocking · www.avilonx.site</div></div><div><h1>${paid ? 'INVOICE' : 'BILLING STATEMENT'}</h1>${paid ? `<div class="small" style="text-align:right">No. ${escapeHTML(bill.invoice_no)}</div>` : ''}</div></div>
  <div class="grid"><div><b>Billed to</b>${escapeHTML(clubName)}</div><div><b>Billing period</b>${escapeHTML(period(bill))}</div>
  <div><b>Date issued</b>${escapeHTML(dayText(String(bill.created_at || '').slice(0, 10)))}</div>
  ${paid ? `<div><b>Payment</b>${escapeHTML(dayText(bill.paid_on))} · ${escapeHTML(bill.pay_method || '')}${bill.pay_reference ? ` · Ref. ${escapeHTML(bill.pay_reference)}` : ''}</div>` : '<div><b>Status</b>Not settled</div>'}</div>
  <table><thead><tr><th>Description</th><th class="r">Birds</th><th class="r">Amount</th></tr></thead><tbody>
  <tr><td>Birds encoded in race entries, ${escapeHTML(period(bill))}</td><td class="r">${Number(bill.birds || 0).toLocaleString('en-PH')}</td><td class="r">${money(bill.amount)}</td></tr>
  <tr class="total"><td>Total${paid ? ' paid' : ' due'}</td><td></td><td class="r">${money(bill.amount)}</td></tr></tbody></table>
  <div class="stamp">${paid ? 'PAID' : 'NOT SETTLED'}</div>${paid && bill.pay_note ? `<p class="small">Note: ${escapeHTML(bill.pay_note)}</p>` : ''}
  <p class="note">Billing is per bird encoded in a race entry. Practice races are free. Payments are non-refundable; deleted entries stay billed.</p>
  ${entries ? `<h2>Birds encoded (${entries.length})</h2><table><thead><tr><th>#</th><th>Encoded</th><th>Race</th><th>Member</th><th>Ring</th><th></th><th class="r">Price</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  </body></html>`;
  const win = openedWindow || window.open('', '_blank');
  if (!win) throw new Error('The browser blocked the new window. Allow pop-ups for AvilonX, then try again.');
  win.document.open(); win.document.write(html); win.document.close();
  win.addEventListener('load', () => setTimeout(() => win.print(), 300));
  return win;
}

// The encoded birds (deleted ones stay, marked billed).
export const birdsTable = list => list.length ? `<div class="table-scroll"><table class="billing-birds"><thead><tr><th>Encoded</th><th>Race</th><th>Member</th><th>Ring</th><th>Price</th></tr></thead><tbody>${list.map(e => `<tr${e.deleted ? ' class="is-deleted"' : ''}>
  <td data-label="Encoded">${escapeHTML(formatDate(e.encoded_at))}</td><td data-label="Race">${escapeHTML(e.race_name || '—')}</td><td data-label="Member">${escapeHTML(e.member_no || '')} ${escapeHTML(e.member_name || '')}</td>
  <td data-label="Ring">${escapeHTML(e.pigeon_ring || '—')}${e.deleted ? ' <span class="tag closed">Deleted · billed</span>' : ''}</td><td data-label="Price">${money(e.price)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small">No birds encoded in these dates.</p>';
