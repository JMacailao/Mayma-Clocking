// Club admin → Billing: settled or not, the club's bills (statement / invoice
// to print), birds not billed yet, and the birds encoded for a start date to
// end date. Read only: the Super Admin makes bills and records payments.
import { supabase, escapeHTML, message, authError } from '../../../assets/js/shared.js';
import { money, period, statusTag, thisMonth, dayText, dateFilterHtml, bindDateFilter, printBill, birdsTable } from '../../../assets/js/billing.js';

export async function render(view) {
  const [{ data: status, error }, { data: bills, error: billsError }] = await Promise.all([supabase.rpc('club_billing_status'), supabase.rpc('billing_bills', { p_club_id: null })]);
  if (error || billsError) { view.innerHTML = `<div class="notice error">${escapeHTML(authError(error || billsError))}</div>`; return; }
  const list = bills || [], unpaid = Number(status.unpaid_bills);
  let [start, end] = thisMonth();
  view.innerHTML = `<div class="split-heading"><div><h2>Billing</h2><p>${money(status.bird_price)} per bird encoded in a race entry. Practice races are free. Deleted entries stay billed (non-refundable).</p></div></div>
  <section class="billing-status ${unpaid ? 'is-bad' : 'is-ok'}" data-billing-status>${unpaid ? `<strong>Not settled</strong><span>${unpaid} bill${unpaid === 1 ? '' : 's'} · ${money(status.unpaid_amount)}</span>` : '<strong>All settled ✓</strong><span>Thank you.</span>'}</section>
  <section class="panel"><div class="panel-heading"><h3>Bills</h3><span class="count-pill">Not billed yet: ${Number(status.unbilled).toLocaleString('en-PH')} birds · about ${money(status.unbilled_amount)}</span></div>
    ${list.length ? `<ul class="billing-bills">${list.map(b => `<li><div><strong>${escapeHTML(period(b))}</strong> ${statusTag(b)}<br><span class="small">${Number(b.birds).toLocaleString('en-PH')} birds · ${money(b.amount)}${b.settled_at ? ` · ${escapeHTML(b.invoice_no)} · paid ${escapeHTML(dayText(b.paid_on))}${b.pay_reference ? ` (Ref. ${escapeHTML(b.pay_reference)})` : ''}` : ''}</span></div>
      <div class="billing-bill-actions"><button class="button secondary" type="button" data-print="${b.id}">${b.settled_at ? 'Print invoice' : 'Print statement'}</button></div></li>`).join('')}</ul>` : '<p class="small">No bills yet.</p>'}
  </section>
  <section class="panel"><div class="panel-heading"><h3>Birds encoded</h3><span class="count-pill" data-birds-count></span></div>${dateFilterHtml(start, end)}<div data-birds-list></div></section>`;
  const loadBirds = async () => {
    const { data, error: birdsError } = await supabase.rpc('billing_entries', { p_club_id: null, p_start: start, p_end: end });
    if (birdsError) { message(authError(birdsError), 'error'); return; }
    const rows = data || [];
    view.querySelector('[data-birds-count]').textContent = `${rows.length.toLocaleString('en-PH')} birds · ${money(rows.reduce((n, r) => n + Number(r.price), 0))}`;
    view.querySelector('[data-birds-list]').innerHTML = birdsTable(rows);
  };
  bindDateFilter(view, (s, e) => { start = s; end = e; loadBirds(); });
  view.querySelectorAll('[data-print]').forEach(button => button.onclick = async () => {
    const bill = list.find(b => String(b.id) === button.dataset.print); if (!bill) return;
    const withList = confirm('Add the list of encoded birds to the printout?');
    const win = window.open('', '_blank');
    let entries = null;
    if (withList) { const { data } = await supabase.rpc('billing_entries', { p_club_id: null, p_start: bill.start_date, p_end: bill.end_date }); entries = (data || []).filter(e => Number(e.bill_id) === Number(bill.id)); }
    try { printBill({ bill, clubName: status.club_name, entries }, win); } catch (printError) { message(printError.message, 'error'); }
  });
  await loadBirds();
}
