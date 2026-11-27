// Super Admin → Billing: birds encoded by every club for a start date to end
// date, bills for those dates, payments (settled + invoice), warnings, price
// per bird, and closing / reopening a club account (billing.sql).
import { supabase, escapeHTML, message, authError, formatDate, loadSpreadsheetParser } from '../../../assets/js/shared.js';
import { money, period, statusTag, thisMonth, dayAfter, phToday, dateFilterHtml, bindDateFilter, printBill, dayText, birdsTable } from '../../../assets/js/billing.js';

export async function render(view) {
  let [start, end] = thisMonth(), rows = [], onlyUnsettled = false;
  view.innerHTML = `<div class="split-heading"><div><h2>Billing</h2><p>Birds encoded in race entries per club. Deleted entries stay billed (non-refundable); practice races are free.</p></div></div>
  <section class="panel">${dateFilterHtml(start, end)}
    <div class="billing-toolbar"><label class="billing-check"><input type="checkbox" data-only-unsettled> Not settled only</label><span class="count-pill" data-bill-totals></span><button class="button secondary" type="button" data-bill-export>Export Excel</button></div>
    <div data-bill-table></div>
  </section>
  <dialog class="billing-dialog" data-club-dialog aria-labelledby="billing-club-title"><section class="panel" data-club-panel></section></dialog>`;
  const table = view.querySelector('[data-bill-table]'), dialog = view.querySelector('[data-club-dialog]'), panel = view.querySelector('[data-club-panel]');
  const getDates = bindDateFilter(view, (s, e) => { start = s; end = e; load(); });
  view.querySelector('[data-only-unsettled]').onchange = event => { onlyUnsettled = event.target.checked; draw(); };

  const statusHtml = r => `${Number(r.unpaid_bills) ? `<span class="tag rejected">Not settled · ${money(r.unpaid_amount)}</span>` : '<span class="tag verified">Settled</span>'}${r.is_closed ? ' <span class="tag closed">Closed</span>' : ''}${Number(r.open_warnings) ? ' <span class="tag pending">Warning not seen</span>' : ''}`;
  const draw = () => {
    const list = onlyUnsettled ? rows.filter(r => Number(r.unpaid_bills) > 0) : rows;
    const birds = list.reduce((n, r) => n + Number(r.birds), 0), amount = list.reduce((n, r) => n + Number(r.amount), 0), unpaid = list.reduce((n, r) => n + Number(r.unpaid_amount), 0);
    view.querySelector('[data-bill-totals]').textContent = `${birds.toLocaleString('en-PH')} birds · ${money(amount)} · not settled ${money(unpaid)}`;
    table.innerHTML = `<div class="table-scroll"><table class="billing-table"><thead><tr><th>Club</th><th>Price</th><th>Birds encoded</th><th>Amount</th><th>Not billed yet</th><th>Status</th></tr></thead><tbody>${list.length ? list.map(r => `<tr>
      <td data-label="Club"><button class="race-point-open" type="button" data-open-club="${escapeHTML(r.club_id)}">${escapeHTML(r.club_name)}</button></td>
      <td data-label="Price">${money(r.bird_price)}</td>
      <td data-label="Birds encoded"><strong>${Number(r.birds).toLocaleString('en-PH')}</strong>${Number(r.deleted) ? ` <span class="small">(${r.deleted} deleted, billed)</span>` : ''}</td>
      <td data-label="Amount">${money(r.amount)}</td>
      <td data-label="Not billed yet">${Number(r.unbilled).toLocaleString('en-PH')} · ${money(r.unbilled_amount)}</td>
      <td data-label="Status">${statusHtml(r)}</td></tr>`).join('') : `<tr><td colspan="6" class="empty-cell">${onlyUnsettled ? 'Every club is settled.' : 'No clubs yet.'}</td></tr>`}</tbody></table></div>`;
    table.querySelectorAll('[data-open-club]').forEach(button => button.onclick = () => openClub(Number(button.dataset.openClub)));
  };
  async function load() {
    const { data, error } = await supabase.rpc('superadmin_billing_summary', { p_start: start, p_end: end });
    if (error) { message(authError(error), 'error'); return; }
    rows = data || []; draw();
    if (dialog.open && panel.dataset.club) openClub(Number(panel.dataset.club));
  }

  view.querySelector('[data-bill-export]').onclick = async () => {
    try {
      const XLSX = await loadSpreadsheetParser(), book = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([['Club', 'Start date', 'End date', 'Price per bird', 'Birds encoded', 'Deleted (billed)', 'Amount', 'Not billed yet', 'Not settled amount', 'Closed'],
        ...rows.map(r => [r.club_name, start, end, Number(r.bird_price), Number(r.birds), Number(r.deleted), Number(r.amount), Number(r.unbilled), Number(r.unpaid_amount), r.is_closed ? 'Yes' : 'No'])]);
      XLSX.utils.book_append_sheet(book, sheet, 'Billing'); XLSX.writeFile(book, `avilonx-billing-${start}-to-${end}.xlsx`);
    } catch (error) { message(error.message || 'Could not export.', 'error'); }
  };

  // One club: bills, payment, price, warning, close / reopen, its encoded birds.
  async function openClub(clubId) {
    const club = rows.find(r => Number(r.club_id) === clubId); if (!club) return;
    panel.dataset.club = String(clubId);
    const [{ data: bills, error: billsError }, { data: warnings }, { data: log }] = await Promise.all([
      supabase.rpc('billing_bills', { p_club_id: clubId }), supabase.rpc('superadmin_billing_warnings', { p_club_id: clubId }), supabase.rpc('superadmin_billing_log', { p_club_id: clubId })]);
    if (billsError) { message(authError(billsError), 'error'); return; }
    const list = bills || [], lastEnd = list.reduce((m, b) => (!m || b.end_date > m ? b.end_date : m), null);
    const billStart = lastEnd && dayAfter(lastEnd) > start ? dayAfter(lastEnd) : start, chosenEnd = end > phToday() ? phToday() : end, billEnd = chosenEnd < billStart ? phToday() : chosenEnd;
    const unpaid = list.filter(b => !b.settled_at);
    const warningText = unpaid.length ? `Unpaid AvilonX bill${unpaid.length > 1 ? 's' : ''}: ${unpaid.map(b => `${period(b)} (${money(b.amount)})`).join(', ')}. Please settle it to keep your club account open.` : '';
    panel.innerHTML = `<div class="panel-heading billing-dialog-head"><div><h3 id="billing-club-title">${escapeHTML(club.club_name)}</h3><p class="small">${statusHtml(club)}</p></div><button class="race-point-close" type="button" data-close-club aria-label="Close">×</button></div>
    <div class="billing-sections">
      <section><h4>Bill these dates</h4><div class="billing-dates"><label class="field"><span>Start date</span><input type="date" data-new-start value="${escapeHTML(billStart)}"></label><label class="field"><span>End date</span><input type="date" data-new-end value="${escapeHTML(billEnd)}" max="${escapeHTML(phToday())}"></label></div>
        <p class="small">${lastEnd ? `The last bill ended ${escapeHTML(dayText(lastEnd))}; the next one starts after it.` : 'No bills yet.'} Not billed yet: ${Number(club.unbilled)} birds · ${money(club.unbilled_amount)}.</p>
        <button class="button primary" type="button" data-create-bill>Create bill for these dates</button></section>
      <section><h4>Bills</h4>${list.length ? `<ul class="billing-bills">${list.map(b => `<li data-bill="${b.id}"><div><strong>${escapeHTML(period(b))}</strong> ${statusTag(b)}<br><span class="small">${Number(b.birds).toLocaleString('en-PH')} birds · ${money(b.amount)}${b.settled_at ? ` · ${escapeHTML(b.invoice_no)} · paid ${escapeHTML(dayText(b.paid_on))} by ${escapeHTML(b.pay_method || '')}${b.pay_reference ? ` (${escapeHTML(b.pay_reference)})` : ''}` : ''}</span></div>
        <div class="billing-bill-actions">${b.settled_at ? '' : `<button class="button primary" type="button" data-settle="${b.id}">Mark settled</button>`}<button class="button secondary" type="button" data-print="${b.id}">${b.settled_at ? 'Print invoice' : 'Print statement'}</button>${b.settled_at ? '' : `<button class="text-button danger-text" type="button" data-remove-bill="${b.id}">Remove</button>`}</div>
        <form class="billing-settle" data-settle-form="${b.id}" hidden><label class="field"><span>Paid on</span><input type="date" name="paid_on" value="${escapeHTML(phToday())}" required></label>
          <label class="field"><span>Paid by</span><select name="method"><option>GCash</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></label>
          <label class="field"><span>Reference no.</span><input name="reference" maxlength="80"></label><label class="field"><span>Note (optional)</span><input name="note" maxlength="300"></label>
          <div class="form-actions"><button class="button primary" type="submit">Save payment</button><button class="button secondary" type="button" data-settle-cancel>Cancel</button></div></form></li>`).join('')}</ul>` : '<p class="small">No bills yet.</p>'}</section>
      <section><h4>Price per bird</h4><div class="billing-inline"><label class="field"><span>Price (₱)</span><input type="number" min="0" max="10000" step="0.01" data-price value="${escapeHTML(club.bird_price)}"></label><button class="button secondary" type="button" data-save-price>Save price</button></div><p class="small">New entries are counted at the new price; old counts keep theirs.</p></section>
      <section><h4>Send a warning</h4><p class="small">It pops up on the club admin's screen until they close it.</p><label class="field"><span>Message</span><textarea rows="3" maxlength="1000" data-warning-text>${escapeHTML(warningText)}</textarea></label><button class="button secondary" type="button" data-send-warning>Send warning</button>
        ${(warnings || []).length ? `<ul class="billing-log">${warnings.map(w => `<li>${escapeHTML(formatDate(w.created_at))}: ${escapeHTML(w.message)} — ${w.seen_at ? `<span class="tag verified">Seen ${escapeHTML(formatDate(w.seen_at))}</span>` : '<span class="tag pending">Not seen yet</span>'}</li>`).join('')}</ul>` : ''}</section>
      <section><h4>Club account</h4>${club.is_closed ? `<p><span class="tag closed">Closed</span> ${escapeHTML(club.closed_reason || '')}</p><button class="button primary" type="button" data-reopen>Reopen club account</button>`
        : `<p class="small">Closing locks out the club admin and staff (members and loft readers keep clocking) until you reopen it.</p><label class="field"><span>Reason (the club admin sees it)</span><input maxlength="500" data-close-reason value="${escapeHTML(unpaid.length ? `Unpaid bill: ${unpaid.map(b => `${period(b)} (${money(b.amount)})`).join(', ')}` : '')}"></label><button class="button danger-button" type="button" data-close-account>Close club account</button>`}</section>
      <details class="billing-more" data-birds-details><summary>Birds encoded ${escapeHTML(dayText(start))} – ${escapeHTML(dayText(end))} (${Number(club.birds)})</summary><div data-birds-list><p class="small">Loading…</p></div></details>
      ${(log || []).length ? `<details class="billing-more"><summary>History</summary><ul class="billing-log">${log.map(l => `<li>${escapeHTML(formatDate(l.created_at))} · <strong>${escapeHTML(l.action)}</strong>${l.detail ? ` · ${escapeHTML(l.detail)}` : ''}</li>`).join('')}</ul></details>` : ''}
    </div>`;
    if (!dialog.open) dialog.showModal();
    const rpc = async (name, args, done) => { const { data, error } = await supabase.rpc(name, args); if (error) { message(authError(error), 'error'); return null; } if (done) message(done, 'success'); await load(); return data ?? true; };
    panel.querySelector('[data-close-club]').onclick = () => dialog.close();
    panel.querySelector('[data-create-bill]').onclick = async () => {
      const s = panel.querySelector('[data-new-start]').value, e = panel.querySelector('[data-new-end]').value;
      if (!s || !e) { message('Choose the start date and end date.', 'error'); return; }
      const bill = await rpc('superadmin_create_bill', { p_club_id: clubId, p_start: s, p_end: e });
      if (bill) message(`Bill created: ${period(bill)} · ${bill.birds} birds · ${money(bill.amount)}.`, 'success');
    };
    panel.querySelectorAll('[data-settle]').forEach(button => button.onclick = () => { const form = panel.querySelector(`[data-settle-form="${button.dataset.settle}"]`); form.hidden = false; form.elements.reference.focus(); });
    panel.querySelectorAll('[data-settle-cancel]').forEach(button => button.onclick = () => { button.closest('form').hidden = true; });
    panel.querySelectorAll('[data-settle-form]').forEach(form => form.onsubmit = async event => {
      event.preventDefault();
      const bill = await rpc('superadmin_settle_bill', { p_bill_id: Number(form.dataset.settleForm), p_paid_on: form.elements.paid_on.value, p_method: form.elements.method.value, p_reference: form.elements.reference.value, p_note: form.elements.note.value });
      if (bill) message(`Settled. Invoice ${bill.invoice_no}.`, 'success');
    });
    panel.querySelectorAll('[data-remove-bill]').forEach(button => button.onclick = async () => {
      if (!confirm('Remove this bill? Its birds go back to "not billed yet".')) return;
      await rpc('superadmin_delete_bill', { p_bill_id: Number(button.dataset.removeBill) }, 'Bill removed.');
    });
    panel.querySelectorAll('[data-print]').forEach(button => button.onclick = async () => {
      const bill = list.find(b => String(b.id) === button.dataset.print); if (!bill) return;
      const withList = confirm('Add the list of encoded birds to the printout?');
      const win = window.open('', '_blank');  // opened before waiting, so the browser allows it
      let entries = null;
      if (withList) { const { data } = await supabase.rpc('billing_entries', { p_club_id: clubId, p_start: bill.start_date, p_end: bill.end_date }); entries = (data || []).filter(e => Number(e.bill_id) === Number(bill.id)); }
      try { printBill({ bill, clubName: club.club_name, entries }, win); } catch (error) { message(error.message, 'error'); }
    });
    panel.querySelector('[data-save-price]').onclick = () => rpc('superadmin_set_bird_price', { p_club_id: clubId, p_price: Number(panel.querySelector('[data-price]').value) }, 'Price saved.');
    panel.querySelector('[data-send-warning]').onclick = () => rpc('superadmin_send_warning', { p_club_id: clubId, p_message: panel.querySelector('[data-warning-text]').value, p_bill_id: unpaid[0]?.id ?? null }, 'Warning sent. It pops up on the club admin\'s screen.');
    panel.querySelector('[data-close-account]')?.addEventListener('click', () => {
      if (!confirm(`Close ${club.club_name}? Its club admin and staff are locked out until you reopen it.`)) return;
      rpc('superadmin_set_club_closed', { p_club_id: clubId, p_closed: true, p_reason: panel.querySelector('[data-close-reason]').value }, 'Club account closed.');
    });
    panel.querySelector('[data-reopen]')?.addEventListener('click', () => rpc('superadmin_set_club_closed', { p_club_id: clubId, p_closed: false, p_reason: '' }, 'Club account reopened.'));
    panel.querySelector('[data-birds-details]').addEventListener('toggle', async event => {
      if (!event.target.open) return;
      const [s, e] = getDates(), { data, error } = await supabase.rpc('billing_entries', { p_club_id: clubId, p_start: s, p_end: e });
      panel.querySelector('[data-birds-list]').innerHTML = error ? `<p class="small">${escapeHTML(authError(error))}</p>` : birdsTable(data || []);
    }, { once: true });
  }
  dialog.addEventListener('close', () => { delete panel.dataset.club; });
  await load();
}

