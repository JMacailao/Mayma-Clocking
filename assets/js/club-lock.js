// Club admin and staff: a closed club account shows a lock screen (only Sign
// out) until the Super Admin reopens it; the Super Admin's warnings pop up for
// the club admin until closed. Checked at start and every minute (billing.sql).
import { supabase, escapeHTML, formatDate } from './shared.js';

const status = async () => {
  const { data, error } = await supabase.rpc('club_account_status');
  if (error) { console.warn('Club account status unavailable:', error.message); return null; }
  return data;
};

function lockScreen(info, signOut) {
  document.body.classList.add('club-locked');
  document.querySelector('#app-shell').innerHTML = `<main class="club-lock" role="alert"><div class="club-lock-card">
    <span class="club-lock-icon" aria-hidden="true">🔒</span>
    <h1>This club account is closed</h1>
    ${info.club_name ? `<p class="club-lock-club">${escapeHTML(info.club_name)}</p>` : ''}
    ${info.closed_reason ? `<p class="club-lock-reason"><strong>Reason:</strong> ${escapeHTML(info.closed_reason)}</p>` : ''}
    <p>Contact AvilonX to reopen it. Your members and loft readers can still clock.</p>
    <button class="button primary" type="button" data-lock-signout>Sign out</button></div></main>`;
  document.querySelector('[data-lock-signout]').onclick = signOut;
}

let shown = new Set();
function showWarnings(warnings) {
  const fresh = (warnings || []).filter(w => !shown.has(w.id));
  if (!fresh.length || document.querySelector('dialog.club-warning')) return;
  fresh.forEach(w => shown.add(w.id));
  const dialog = document.createElement('dialog');
  dialog.className = 'club-warning'; dialog.setAttribute('aria-labelledby', 'club-warning-title');
  dialog.innerHTML = `<h2 id="club-warning-title">⚠ Message from AvilonX</h2>${fresh.map(w => `<div class="club-warning-item"><p>${escapeHTML(w.message)}</p><span class="small">${escapeHTML(formatDate(w.created_at))}</span></div>`).join('')}
    <div class="form-actions"><a class="button secondary" data-warning-billing href="">See billing</a><button class="button primary" type="button" data-warning-close>Close</button></div>`;
  document.body.append(dialog);
  const billing = dialog.querySelector('[data-warning-billing]');
  billing.href = new URL('pages/admin/billing/index.html', document.body.dataset.appRoot || new URL(document.body.dataset.base || '../../', location.href)).href;
  const close = async () => { dialog.close(); dialog.remove(); await Promise.all(fresh.map(w => supabase.rpc('club_dismiss_warning', { p_id: w.id }))); };
  dialog.querySelector('[data-warning-close]').onclick = close;
  billing.addEventListener('click', () => { fresh.forEach(w => supabase.rpc('club_dismiss_warning', { p_id: w.id })); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.showModal();
}

// Returns true when the club is closed (the lock screen is shown; stop loading the page).
export async function watchClubAccount(signOut) {
  const first = await status();
  if (first?.is_closed) { lockScreen(first, signOut); return true; }
  showWarnings(first?.warnings);
  const timer = setInterval(async () => {
    const now = await status();
    if (now?.is_closed) { clearInterval(timer); lockScreen(now, signOut); return; }
    showWarnings(now?.warnings);
  }, 60_000);
  return false;
}
